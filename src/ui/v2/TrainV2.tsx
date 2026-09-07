import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid, usableStorageGB } from '../../contracts';
import { buildRealDemoTimeline } from '../../core/scenario/realDemoTimeline';
import { ScenarioRunner } from '../../core/scenario/ScenarioRunner';
import { tleToElementSet } from '../../core/tle/omm';
import { initialTruthState, type TruthState } from '../../core/truth/TruthState';
import { Button } from './primitives/Button';
import { Pill, type PillTone } from './primitives/Pill';
import { Surface } from './primitives/Surface';

const TICK_MS = 250; // matches the ~4Hz refresh convention useViewerStore already uses for simTime
// ×3600 ("1 hour per second") is the default: buildRealDemoTimeline's first real event is
// typically many hours past scenario start (real orbital geometry, not an authored offset — see
// docs/design/operator-simulation.md's "Real Scenario 01 timeline" section), so a slower default
// would leave the console looking idle for most of a session. ×1/×10/×60 stay available for
// operators who want to inspect the run at finer granularity once something is happening.
const RATES = [1, 10, 60, 3600] as const;
const DEFAULT_RATE = 3600;

const TASK_STATUS_TONE: Record<string, PillTone> = {
  planned: 'info',
  active: 'warning',
  completed: 'nominal',
  failed: 'critical',
};

/**
 * Train console: runs the Asteria-1 scenario headlessly (`ScenarioRunner`) against a schedule
 * computed from real orbital geometry (`buildRealDemoTimeline` — the actual next daylight imaging
 * opportunity and ground contact, not an authored timeline), ticking every `TICK_MS` while
 * playing. First real (not placeholder) content in Shell V2's Train workspace — deliberately
 * basic per the roadmap ("Train console בסיסי"): a clock with play/pause/rate, a storage gauge,
 * and a task list. No telemetry channels, alarms, or procedure checklists yet — those are later
 * PRs. No real Plan workspace exists yet either, so this always runs the same Scenario 01 story,
 * not an operator-authored plan.
 */
export function TrainV2() {
  const { t } = useTranslation();
  const runnerRef = useRef<ScenarioRunner | null>(null);
  const [running, setRunning] = useState(true);
  const [rate, setRate] = useState<number>(DEFAULT_RATE);
  const [simTime, setSimTime] = useState<Date>(() => new Date(ASTERIA_1_SCENARIO.startTime));
  const [truth, setTruth] = useState<TruthState>(initialTruthState);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  useEffect(() => {
    const runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
    runnerRef.current = runner;
    try {
      const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
      const timeline = buildRealDemoTimeline(satrec, new Date(ASTERIA_1_SCENARIO.startTime));
      for (const { simTime: eventTime, event } of timeline) runner.schedule(eventTime, event);
    } catch (error) {
      setTimelineError(error instanceof Error ? error.message : String(error));
    }
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

      {timelineError && (
        <p className="sl-train__error" role="alert">
          {t('train.timelineError', { message: timelineError })}
        </p>
      )}

      <Surface raised className="sl-train__clock">
        <span className="sl-mono sl-tabular sl-train__clock-value">{simTime.toISOString().slice(0, 19)}Z</span>
        <div className="sl-train__controls">
          <Button variant={running ? 'default' : 'primary'} onClick={() => setRunning((value) => !value)}>
            {running ? t('train.pause') : t('train.play')}
          </Button>
          <div className="sl-train__rates" role="group" aria-label={t('train.rate')}>
            {RATES.map((r) => (
              <Button key={r} variant={rate === r ? 'primary' : 'ghost'} onClick={() => setRate(r)}>
                <span className="sl-bidi-isolate">×{r}</span>
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
