import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE } from '../../contracts';
import type { DomainEvent } from '../../contracts/events';
import { operatorRecords } from '../../contracts/envelope';
import type { CompiledPlan } from '../../core/scenario/executablePlan';
import { buildDebriefTimeline } from '../../core/debrief/debriefTimeline';
import { useTraining } from '../../state/training';
import { Button } from './primitives/Button';
import { Pill } from './primitives/Pill';
import { Surface } from './primitives/Surface';

function taskName(
  t: (key: string, options?: Record<string, unknown>) => string,
  taskId: string,
  plan: CompiledPlan | null,
): string {
  const index = plan?.tasks.findIndex((task) => task.id === taskId) ?? -1;
  const task = plan?.tasks[index];
  return task
    ? `#${index + 1} · ${t(task.kind === 'imaging' ? 'plan.captureLabel' : 'plan.downlinkLabel', { mode: task.mode, station: task.subject })}`
    : t(`train.taskLabels.${taskId}`, { defaultValue: taskId });
}

function describeEvent(
  t: (key: string, options?: Record<string, unknown>) => string,
  event: DomainEvent,
  plan: CompiledPlan | null,
): string {
  const taskLabel = (taskId: string) => taskName(t, taskId, plan);
  const contactLabel = (id: string) => {
    const c = plan?.candidates.find((c) => c.kind === 'downlink' && c.contactId === id);
    return c ? taskLabel(c.id) : id;
  };
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
        id: taskLabel(event.dataProduct.taskId),
        mode: event.dataProduct.mode,
        sizeGB: event.dataProduct.sizeGB,
      });
    case 'ContactAcquired@1':
      return t('debrief.events.contactAcquired', { contactId: contactLabel(event.contactId) });
    case 'ContactLost@1':
      return t('debrief.events.contactLost', { contactId: contactLabel(event.contactId) });
    case 'DownlinkCompleted@1':
      return t('debrief.events.downlinkCompleted', {
        dataProductId: plan ? taskLabel(event.dataProductId) : event.dataProductId,
        contactId: contactLabel(event.contactId),
      });
    case 'CommandAccepted@1':
      return t('debrief.events.commandAccepted', { commandId: plan ? taskLabel(event.taskId) : event.commandId });
    case 'CommandRejected@1':
      return t('debrief.events.commandRejected', { commandId: event.commandId, reason: event.reason });
    case 'CommandExecuted@1':
      return t('debrief.events.commandExecuted', { commandId: plan ? taskLabel(event.taskId) : event.commandId });
  }
}

/** Debrief the exact event log from Train, including partial and paused runs. */
export function DebriefV2({ onTrain }: { onTrain: () => void }) {
  const { t } = useTranslation();
  const records = useTraining((s) => s.records);
  const plan = useTraining((s) => s.plan);
  const decisions = operatorRecords(records).filter(
    (r) => r.event.type === 'PlanCommitted@1' || r.event.type === 'WarningWaived@1',
  );
  const rows = useMemo(() => buildDebriefTimeline(records, ASTERIA_1_PROFILE), [records]);
  const contactName = (id: string) => {
    const candidate = plan?.candidates.find((c) => c.kind === 'downlink' && c.contactId === id);
    return candidate ? (plan?.tasks.find((task) => task.id === candidate.id)?.subject ?? id) : id;
  };

  return (
    <div className="sl-debrief">
      <header className="sl-debrief__header">
        <h1>{t('debrief.title')}</h1>
        <p className="sl-debrief__disclaimer">{t('train.disclaimer')}</p>
        <p className="sl-debrief__note">{t('debrief.note')}</p>
      </header>

      <Button onClick={onTrain}>{t('debrief.backToTrain')}</Button>
      {decisions.length > 0 && (
        <Surface className="sl-debrief__decisions" data-testid="plan-audit">
          <h2>{t('debrief.decisions')}</h2>
          <ul>
            {decisions.map((record) => {
              const cause = records.find((r) => r.recordId === record.causedBy?.recordId)?.event;
              const task = cause && 'taskId' in cause ? taskName(t, cause.taskId, plan) : '';
              return (
                <li key={record.recordId}>
                  {record.event.type === 'PlanCommitted@1'
                    ? t('debrief.planCommitted')
                    : record.event.type === 'WarningWaived@1'
                      ? t('debrief.warningWaived', {
                          task,
                          warning: t(`plan.findings.${record.event.code}`, { defaultValue: record.event.code }),
                          reason: record.event.reason,
                        })
                      : null}
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
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
                    <span className="sl-debrief__row-event">{describeEvent(t, row.event, plan)}</span>
                  </div>
                  <div className="sl-debrief__row-state">
                    <div className="sl-debrief__state-col">
                      <span className="sl-debrief__state-label">{t('debrief.truthColumn')}</span>
                      <span className="sl-mono sl-tabular">
                        {row.truth.activeContactIds.length > 0
                          ? t('debrief.activeContacts', { ids: row.truth.activeContactIds.map(contactName).join(', ') })
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
                          ? t('debrief.confirmedContacts', {
                              ids: row.observables.confirmedContactIds.map(contactName).join(', '),
                            })
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
