import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, generateUlid, usableStorageGB } from '../../contracts';
import { ScenarioRunner } from '../../core/scenario/ScenarioRunner';
import { initialTruthState, type TruthState } from '../../core/truth/TruthState';
import { Button } from './primitives/Button';
import { Pill, type PillTone } from './primitives/Pill';
import { Surface } from './primitives/Surface';

const TICK_MS = 250; // matches the ~4Hz refresh convention useViewerStore already uses for simTime
const RATES = [1, 10, 60] as const;

/**
 * A minimal, fixed timeline standing in for a real Plan workspace (not built yet): one imaging
 * task, one data product, one downlink contact — Scenario 01's Capture -> Store -> Contact ->
 * Downlink shape (docs/design/operator-simulation.md), simplified to prove the pipeline visibly
 * does something as the clock runs, not to be a real planned scenario.
 */
function scheduleDemoTimeline(runner: ScenarioRunner, start: Date): void {
  const at = (offsetS: number) => new Date(start.getTime() + offsetS * 1000);
  runner.schedule(at(10), { type: 'TaskStarted@1', taskId: 'capture-1' });
  runner.schedule(at(30), {
    type: 'DataProductStored@1',
    dataProduct: {
      id: 'product-1',
      taskId: 'capture-1',
      mode: 'PAN',
      sizeGB: ASTERIA_1_PROFILE.storage.productGB.PAN,
    },
  });
  runner.schedule(at(35), { type: 'TaskCompleted@1', taskId: 'capture-1', outcome: 'success' });
  runner.schedule(at(60), { type: 'ContactAcquired@1', stationId: 'gs-home', contactId: 'contact-1' });
  runner.schedule(at(90), { type: 'TaskStarted@1', taskId: 'downlink-1' });
  runner.schedule(at(120), {
    type: 'DownlinkCompleted@1',
    contactId: 'contact-1',
    dataProductId: 'product-1',
    mode: 'PAN',
  });
  runner.schedule(at(125), { type: 'TaskCompleted@1', taskId: 'downlink-1', outcome: 'success' });
  runner.schedule(at(150), { type: 'ContactLost@1', stationId: 'gs-home', contactId: 'contact-1' });
}

const TASK_STATUS_TONE: Record<string, PillTone> = {
  planned: 'info',
  active: 'warning',
  completed: 'nominal',
  failed: 'critical',
};

/**
 * Train console: runs the Asteria-1 scenario headlessly (`ScenarioRunner`) against the demo
 * timeline above, ticking every `TICK_MS` while playing. First real (not placeholder) content in
 * Shell V2's Train workspace — deliberately basic per the roadmap ("Train console בסיסי"): a
 * clock with play/pause/rate, a storage gauge, and a task list. No telemetry channels, alarms, or
 * procedure checklists yet — those are later PRs.
 */
export function TrainV2() {
  const { t } = useTranslation();
  const runnerRef = useRef<ScenarioRunner | null>(null);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState<number>(60);
  const [simTime, setSimTime] = useState<Date>(() => new Date(ASTERIA_1_SCENARIO.startTime));
  const [truth, setTruth] = useState<TruthState>(initialTruthState);

  useEffect(() => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
    runnerRef.current = runner;
    scheduleDemoTimeline(runner, new Date(ASTERIA_1_SCENARIO.startTime));
    return () => {
      runnerRef.current = null;
    };
  }, []);

  useEffect(() => {
    runnerRef.current?.clock.setMultiplier(rate);
  }, [rate]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      const runner = runnerRef.current;
      if (!runner) return;
      runner.advance(TICK_MS);
      setSimTime(runner.clock.simTime);
      setTruth(runner.truth);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running]);

  const usableGB = usableStorageGB(ASTERIA_1_PROFILE);
  const storagePercent = Math.min(100, (truth.storageUsedGB / usableGB) * 100);
  const taskIds = Object.keys(truth.taskStatus);

  return (
    <div className="sl-train">
      <header className="sl-train__header">
        <h1>{t('train.title')}</h1>
        <p className="sl-train__disclaimer">{t('train.disclaimer')}</p>
      </header>

      <Surface raised className="sl-train__clock">
        <span className="sl-mono sl-tabular sl-train__clock-value">{simTime.toISOString().slice(0, 19)}Z</span>
        <div className="sl-train__controls">
          <Button variant={running ? 'default' : 'primary'} onClick={() => setRunning((value) => !value)}>
            {running ? t('train.pause') : t('train.play')}
          </Button>
          <div className="sl-train__rates" role="group" aria-label={t('train.rate')}>
            {RATES.map((r) => (
              <Button key={r} variant={rate === r ? 'primary' : 'ghost'} onClick={() => setRate(r)}>
                ×{r}
              </Button>
            ))}
          </div>
        </div>
      </Surface>

      <Surface className="sl-train__storage">
        <div className="sl-train__storage-label">
          <span>{t('train.storage')}</span>
          <span className="sl-mono sl-tabular">
            {truth.storageUsedGB.toFixed(2)} / {usableGB} GB
          </span>
        </div>
        <div className="sl-train__storage-bar">
          <div className="sl-train__storage-fill" style={{ width: `${storagePercent}%` }} />
        </div>
      </Surface>

      <Surface className="sl-train__tasks">
        <h2>{t('train.tasks')}</h2>
        {taskIds.length === 0 ? (
          <p className="sl-train__empty">{t('train.noTasksYet')}</p>
        ) : (
          <ul className="sl-train__task-list">
            {taskIds.map((taskId) => {
              const status = truth.taskStatus[taskId]!;
              return (
                <li key={taskId} className="sl-train__task-row">
                  <span>{t(`train.taskLabels.${taskId}`, { defaultValue: taskId })}</span>
                  <Pill tone={TASK_STATUS_TONE[status] ?? 'info'}>{t(`train.taskStatus.${status}`)}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
