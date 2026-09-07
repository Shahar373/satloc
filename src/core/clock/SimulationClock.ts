/**
 * An independent simulation-time clock: a `Date` plus a rate multiplier and a running/paused
 * flag, advanced only by explicit calls — never by reading `Date.now()`/`performance.now()`
 * itself. This is what makes it usable identically inside a Web Worker (no wall clock available
 * there in the same way), in a deterministic unit test (advance by a known delta, no timers), or
 * mirroring a live Cesium `Viewer.clock` (see `src/viewer/ClockAdapter.ts` — per this project's
 * rule that simulation time comes from `viewer.clock.currentTime` when a viewer is attached,
 * `ClockAdapter` mirrors that clock into a `SimulationClock` rather than the two drifting apart
 * as two independently-advancing clocks would).
 */

export interface ClockSnapshot {
  simTimeMs: number;
  multiplier: number;
  running: boolean;
}

export type ClockListener = (snapshot: ClockSnapshot) => void;

export class SimulationClock {
  private simTimeMs: number;
  private clockMultiplier: number;
  private clockRunning: boolean;
  private readonly listeners = new Set<ClockListener>();

  constructor(initial: Date, options: { multiplier?: number; running?: boolean } = {}) {
    this.simTimeMs = initial.getTime();
    this.clockMultiplier = options.multiplier ?? 1;
    if (!(this.clockMultiplier > 0)) {
      throw new Error(`SimulationClock: multiplier must be > 0, got ${this.clockMultiplier}`);
    }
    this.clockRunning = options.running ?? true;
  }

  get simTime(): Date {
    return new Date(this.simTimeMs);
  }

  get multiplier(): number {
    return this.clockMultiplier;
  }

  get running(): boolean {
    return this.clockRunning;
  }

  /**
   * Advances simTime by `realElapsedMs * multiplier`. A no-op while paused, so a driver (a
   * rAF loop, a headless worker interval) can call this unconditionally without checking
   * `running` itself first.
   */
  advance(realElapsedMs: number): void {
    if (!this.clockRunning || realElapsedMs === 0) return;
    this.simTimeMs += realElapsedMs * this.clockMultiplier;
    this.notify();
  }

  /** Jumps directly to a simulation time. Backward jumps are allowed — that's a seek, not an error; callers that need to record it as a `SimulationSeeked` event do so at a higher layer. */
  seek(to: Date): void {
    const ms = to.getTime();
    if (ms === this.simTimeMs) return;
    this.simTimeMs = ms;
    this.notify();
  }

  setMultiplier(multiplier: number): void {
    if (!(multiplier > 0)) {
      throw new Error(`SimulationClock.setMultiplier: multiplier must be > 0, got ${multiplier}`);
    }
    if (multiplier === this.clockMultiplier) return;
    this.clockMultiplier = multiplier;
    this.notify();
  }

  pause(): void {
    if (!this.clockRunning) return;
    this.clockRunning = false;
    this.notify();
  }

  resume(): void {
    if (this.clockRunning) return;
    this.clockRunning = true;
    this.notify();
  }

  /** Returns an unsubscribe function. Called synchronously on every state-changing method above. */
  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot: ClockSnapshot = {
      simTimeMs: this.simTimeMs,
      multiplier: this.clockMultiplier,
      running: this.clockRunning,
    };
    for (const listener of this.listeners) listener(snapshot);
  }
}
