import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid } from '../../contracts';
import type { DomainEvent } from '../../contracts/events';
import { buildDebriefTimeline, type DebriefRow } from '../../core/debrief/debriefTimeline';
import { buildRealDemoTimeline } from '../../core/scenario/realDemoTimeline';
import { ScenarioRunner } from '../../core/scenario/ScenarioRunner';
import { tleToElementSet } from '../../core/tle/omm';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

// Comfortably longer than the real timeline's last event (buildRealDemoTimeline's first real
// opportunity is typically tens of hours out, plus a short contact) — advanced in one bulk call
// (multiplier defaults to 1, so this is simulated ms, not a real wait) to replay the whole run.
const ADVANCE_MS = 5 * 24 * 60 * 60 * 1000;

function describeEvent(t: (key: string, options?: Record<string, unknown>) => string, event: DomainEvent): string {
  const taskLabel = (taskId: string) => t(`train.taskLabels.${taskId}`, { defaultValue: taskId });
  switch (event.type) {
    case 'TaskStarted@1':
      return t('debrief.events.taskStarted', { task: taskLabel(event.taskId) });
    case 'TaskCompleted@1':
      return t('debrief.events.taskCompleted', {
        task: taskLabel(event.taskId),
        outcome: t(`train.taskStatus.${event.outcome === 'failed' ? 'failed' : 'completed'}`),
      });
    case 'DataProductStored@1':
      return t('debrief.events.dataProductStored', {
        id: event.dataProduct.id,
        mode: event.dataProduct.mode,
        sizeGB: event.dataProduct.sizeGB,
      });
    case 'ContactAcquired@1':
      return t('debrief.events.contactAcquired', { contactId: event.contactId });
    case 'ContactLost@1':
      return t('debrief.events.contactLost', { contactId: event.contactId });
    case 'DownlinkCompleted@1':
      return t('debrief.events.downlinkCompleted', {
        dataProductId: event.dataProductId,
        contactId: event.contactId,
      });
    case 'CommandAccepted@1':
      return t('debrief.events.commandAccepted', { commandId: event.commandId });
    case 'CommandRejected@1':
      return t('debrief.events.commandRejected', { commandId: event.commandId, reason: event.reason });
    case 'CommandExecuted@1':
      return t('debrief.events.commandExecuted', { commandId: event.commandId });
  }
}

/**
 * Debrief view: replays Scenario 01's real demo timeline (`buildRealDemoTimeline`, the same
 * geometry-driven schedule `TrainV2` runs live) to completion in one bulk `advance`, then shows
 * `buildDebriefTimeline`'s row-by-row Truth State next to Operator Observables — concretely
 * demonstrating the lag `docs/design/operator-simulation.md`'s "Truth State vs Operator
 * Observables" section has documented since PR #31: at `ContactAcquired@1`, Truth already lists
 * the contact active while Observables hasn't confirmed it yet (the console's real
 * `acquisitionS`-second lock-on delay), until a later row where both agree.
 *
 * Deliberately a replay of the fixed demo run, not a live/selectable session — there's no
 * persisted session log to browse yet (`docs/design/operator-simulation.md`'s open items), so this
 * is the same "basic Debrief, real data, no session picker" scope every other workspace here
 * started from (Train's fixed demo, Plan's browse mode before the draft accumulator).
 *
 * Computed in a `useEffect`, not a render-time `useMemo`: this replay's real SGP4 opportunity/pass
 * search is the same non-trivial computation `TrainV2` also does (and `TrainV2` runs it in an
 * effect for the same reason) — doing it synchronously during render would delay React committing
 * everything else in that same update (e.g. a Rail drawer close transition triggered by the same
 * navigation) until the whole replay finishes, rather than letting that commit paint first.
 */
export function DebriefV2() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DebriefRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
      const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
      const timeline = buildRealDemoTimeline(satrec, new Date(ASTERIA_1_SCENARIO.startTime));
      for (const { simTime, event } of timeline) runner.schedule(simTime, event);
      runner.advance(ADVANCE_MS);
      setRows(buildDebriefTimeline(runner.log.records, ASTERIA_1_PROFILE));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="sl-debrief">
      <header className="sl-debrief__header">
        <h1>{t('debrief.title')}</h1>
        <p className="sl-debrief__disclaimer">{t('train.disclaimer')}</p>
        <p className="sl-debrief__note">{t('debrief.note')}</p>
      </header>

      {error && (
        <p className="sl-debrief__error" role="alert">
          {t('debrief.loadError', { message: error })}
        </p>
      )}

      <Surface className="sl-debrief__list-surface">
        {loading ? (
          <p className="sl-debrief__empty">{t('debrief.loading')}</p>
        ) : rows.length === 0 && !error ? (
          <p className="sl-debrief__empty">{t('debrief.empty')}</p>
        ) : (
          <ul className="sl-debrief__list">
            {rows.map((row, index) => {
              const diverges = row.truth.activeContactIds.some(
                (id) => !row.observables.confirmedContactIds.includes(id),
              );
              return (
                <li key={`${row.simTime.toISOString()}-${row.event.type}-${index}`} className="sl-debrief__row">
                  <div className="sl-debrief__row-main">
                    <span className="sl-mono sl-tabular sl-debrief__row-time">{row.simTime.toISOString()}</span>
                    <span className="sl-debrief__row-event">{describeEvent(t, row.event)}</span>
                  </div>
                  <div className="sl-debrief__row-state">
                    <div className="sl-debrief__state-col">
                      <span className="sl-debrief__state-label">{t('debrief.truthColumn')}</span>
                      <span className="sl-mono sl-tabular">
                        {row.truth.activeContactIds.length > 0
                          ? t('debrief.activeContacts', { ids: row.truth.activeContactIds.join(', ') })
                          : t('debrief.noActiveContacts')}
                      </span>
                      <span className="sl-mono sl-tabular">
                        {t('debrief.storage', { gb: row.truth.storageUsedGB.toFixed(1) })}
                      </span>
                    </div>
                    <div className="sl-debrief__state-col">
                      <span className="sl-debrief__state-label">{t('debrief.observablesColumn')}</span>
                      <span className="sl-mono sl-tabular">
                        {row.observables.confirmedContactIds.length > 0
                          ? t('debrief.confirmedContacts', { ids: row.observables.confirmedContactIds.join(', ') })
                          : t('debrief.noConfirmedContacts')}
                      </span>
                    </div>
                  </div>
                  {diverges && <Pill tone="warning">{t('debrief.diverges')}</Pill>}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
