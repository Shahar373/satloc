import { create } from 'zustand';
import { ASTERIA_1_SCENARIO, ASTERIA_1_TLE, generateUlid } from '../contracts';
import type { EventEnvelope } from '../contracts/envelope';
import type { RunControlEvent } from '../contracts/events';
import { buildRealDemoTimeline, type ScheduledEvent } from '../core/scenario/realDemoTimeline';
import { ScenarioRunner } from '../core/scenario/ScenarioRunner';
import { tleToElementSet } from '../core/tle/omm';
import { initialTruthState, type TruthState } from '../core/truth/TruthState';

interface TrainingState {
  status: 'idle' | 'ready' | 'complete' | 'error';
  error: string | null;
  simTime: Date;
  running: boolean;
  rate: number;
  truth: TruthState;
  records: readonly EventEnvelope[];
  nextEventTime: Date | null;
  initialize: () => void;
  restart: () => void;
  setRunning: (running: boolean) => void;
  setRate: (rate: number) => void;
  advance: (realElapsedMs: number) => void;
  stepNext: () => void;
}

/** One in-memory run per app session. Navigation never creates a replacement event log. */
export function createTrainingStore() {
  return create<TrainingState>()((set, get) => {
    let runner: ScenarioRunner | null = null;
    let timeline: ScheduledEvent[] = [];

    const record = (event: RunControlEvent) => {
      if (runner) runner.log.append({ stream: 'run-control', event, simTime: runner.clock.simTime });
    };
    const publish = () => {
      if (!runner) return;
      const simTime = runner.clock.simTime;
      const nextEventTime = timeline.find((item) => item.simTime > simTime)?.simTime ?? null;
      if (!nextEventTime) runner.clock.pause();
      set({
        simTime,
        nextEventTime,
        status: nextEventTime ? 'ready' : 'complete',
        running: runner.clock.running,
        rate: runner.clock.multiplier,
        truth: runner.truth,
        records: [...runner.log.records],
      });
    };
    const initialize = () => {
      if (runner) return;
      try {
        const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
        timeline = buildRealDemoTimeline(satrec, new Date(ASTERIA_1_SCENARIO.startTime));
        runner = new ScenarioRunner(ASTERIA_1_SCENARIO, generateUlid());
        for (const item of timeline) runner.schedule(item.simTime, item.event);
        runner.clock.setMultiplier(get().rate);
        record({ type: 'SimulationRateChanged@1', rate: get().rate });
        runner.clock.pause();
        record({ type: 'SimulationPaused@1' });
        set({ error: null });
        publish();
      } catch (error) {
        runner = null;
        timeline = [];
        set({ status: 'error', running: false, error: error instanceof Error ? error.message : String(error) });
      }
    };

    return {
      status: 'idle',
      error: null,
      simTime: new Date(ASTERIA_1_SCENARIO.startTime),
      running: false,
      rate: 3600,
      truth: initialTruthState(),
      records: [],
      nextEventTime: null,
      initialize,
      restart() {
        runner = null;
        timeline = [];
        initialize();
      },
      setRunning(running) {
        if (!runner || get().status !== 'ready' || get().running === running) return;
        if (running) runner.clock.resume();
        else runner.clock.pause();
        record({ type: running ? 'SimulationResumed@1' : 'SimulationPaused@1' });
        publish();
      },
      setRate(rate) {
        if (!Number.isFinite(rate) || rate <= 0 || rate === get().rate) return;
        set({ rate });
        if (!runner) return;
        runner.clock.setMultiplier(rate);
        record({ type: 'SimulationRateChanged@1', rate });
        publish();
      },
      advance(realElapsedMs) {
        if (!runner || !get().running || !Number.isFinite(realElapsedMs) || realElapsedMs <= 0) return;
        const end = timeline.at(-1)?.simTime.getTime() ?? runner.clock.simTime.getTime();
        const remaining = Math.max(0, end - runner.clock.simTime.getTime());
        runner.advance(Math.min(realElapsedMs, remaining / runner.clock.multiplier));
        publish();
      },
      stepNext() {
        const next = get().nextEventTime;
        if (!runner || !next) return;
        get().setRunning(false);
        record({ type: 'SimulationSeeked@1', toSimTime: next.toISOString() });
        // Use the scheduler's forward-advance path so all events at this timestamp fire once.
        runner.clock.seek(next);
        runner.advance(0);
        publish();
      },
    };
  });
}

export const useTraining = createTrainingStore();
