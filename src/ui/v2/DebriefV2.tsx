import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE } from '../../contracts';
import type { DomainEvent } from '../../contracts/events';
import { buildDebriefTimeline } from '../../core/debrief/debriefTimeline';
import { useTraining } from '../../state/training';
import { Button } from './primitives/Button';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

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

/** Debrief the exact event log from Train, including partial and paused runs. */
export function DebriefV2({ onTrain }: { onTrain: () => void }) {
  const { t } = useTranslation();
  const records = useTraining((s) => s.records);
  const rows = useMemo(() => buildDebriefTimeline(records, ASTERIA_1_PROFILE), [records]);

  return (
    <div className="sl-debrief">
      <header className="sl-debrief__header">
        <h1>{t('debrief.title')}</h1>
        <p className="sl-debrief__disclaimer">{t('train.disclaimer')}</p>
        <p className="sl-debrief__note">{t('debrief.note')}</p>
      </header>

      <Button onClick={onTrain}>{t('debrief.backToTrain')}</Button>
      <Surface className="sl-debrief__list-surface">
        {rows.length === 0 ? (
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
