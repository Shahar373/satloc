import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTERIA_1_PROFILE, usableStorageGB } from '../../contracts';
import { useTraining } from '../../state/training';
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

const TASK_STATUS_TONE: Record<string, PillTone> = {
  planned: 'info',
  active: 'warning',
  completed: 'nominal',
  failed: 'critical',
};

/** The active training session pauses on navigation and resumes only at the operator's request. */
export function TrainV2({ onDebrief }: { onDebrief: () => void }) {
  const { t } = useTranslation();
  const {
    running,
    rate,
    simTime,
    truth,
    error: timelineError,
    status,
    nextEventTime,
    initialize,
    setRunning,
    setRate,
    advance,
    stepNext,
    restart,
  } = useTraining();
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    initialize();
    return () => setRunning(false);
  }, [initialize, setRunning]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setRunning(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setRunning]);

  useEffect(() => {
    if (!running) return;
    let previous = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      advance(now - previous);
      previous = now;
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [running, advance]);

  const usableGB = usableStorageGB(ASTERIA_1_PROFILE);
  const storagePercent = Math.min(100, (truth.storageUsedGB / usableGB) * 100);
  const taskIds = Object.keys(truth.taskStatus);

  return (
    <div className="sl-train">
      <header className="sl-train__header">
        <h1>{t('train.title')}</h1>
        <p className="sl-train__disclaimer">{t('train.disclaimer')}</p>
        <p className="sl-plan__note">{t('train.sessionHint')}</p>
      </header>

      {timelineError && (
        <p className="sl-train__error" role="alert">
          {t('train.timelineError', { message: timelineError })}
        </p>
      )}

      <Surface raised className="sl-train__clock">
        <span className="sl-mono sl-tabular sl-train__clock-value">{simTime.toISOString().slice(0, 19)}Z</span>
        <div className="sl-train__controls">
          <Button
            variant={running ? 'default' : 'primary'}
            disabled={status !== 'ready'}
            onClick={() => setRunning(!running)}
          >
            {running ? t('train.pause') : t('train.play')}
          </Button>
          <div className="sl-train__rates" role="group" aria-label={t('train.rate')}>
            {RATES.map((r) => (
              <Button
                key={r}
                variant={rate === r ? 'primary' : 'ghost'}
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
              >
                <span className="sl-bidi-isolate">×{r}</span>
              </Button>
            ))}
          </div>
        </div>
      </Surface>

      <Surface className="sl-train__next">
        <div>
          <strong>{t(status === 'complete' ? 'train.complete' : 'train.next')}</strong>
          {nextEventTime && <div className="sl-mono sl-tabular">{nextEventTime.toISOString().slice(0, 19)}Z</div>}
        </div>
        <div className="sl-train__controls">
          <Button onClick={stepNext} disabled={!nextEventTime} data-testid="training-next">
            {t('train.step')}
          </Button>
          <Button onClick={onDebrief}>{t('train.review')}</Button>
          <Button
            onClick={() => {
              if (confirmRestart) {
                restart();
                setConfirmRestart(false);
              } else {
                setRunning(false);
                setConfirmRestart(true);
              }
            }}
          >
            {t(confirmRestart ? 'train.confirmRestart' : 'train.restart')}
          </Button>
          {confirmRestart && (
            <Button variant="ghost" onClick={() => setConfirmRestart(false)}>
              {t('train.cancel')}
            </Button>
          )}
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
