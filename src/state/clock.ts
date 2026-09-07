import { create } from 'zustand';
import { SimulationClock, type ClockSnapshot } from '../core/clock/SimulationClock';

export interface ClockStore {
  simTime: Date;
  multiplier: number;
  running: boolean;
  pause(): void;
  resume(): void;
  setMultiplier(multiplier: number): void;
  seek(to: Date): void;
  advance(realElapsedMs: number): void;
}

/**
 * Creates a Zustand hook wrapping a fresh `SimulationClock`. A factory rather than one
 * app-wide singleton (unlike `useViewerStore`): Phase C's Train console, Debrief, and replay
 * each need their own independently seekable clock — e.g. replaying a past session's log must
 * not move the clock a live scenario is still running on. Callers own the returned hook's
 * lifetime; nothing here is wired into `AppV2`/`useViewerStore` yet.
 */
export function createClockStore(initial: Date, options?: { multiplier?: number; running?: boolean }) {
  const clock = new SimulationClock(initial, options);
  const useClock = create<ClockStore>()((set) => {
    clock.subscribe((snapshot: ClockSnapshot) => {
      set({ simTime: new Date(snapshot.simTimeMs), multiplier: snapshot.multiplier, running: snapshot.running });
    });
    return {
      simTime: clock.simTime,
      multiplier: clock.multiplier,
      running: clock.running,
      pause: () => clock.pause(),
      resume: () => clock.resume(),
      setMultiplier: (multiplier: number) => clock.setMultiplier(multiplier),
      seek: (to: Date) => clock.seek(to),
      advance: (realElapsedMs: number) => clock.advance(realElapsedMs),
    };
  });
  return useClock;
}
