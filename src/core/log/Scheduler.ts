import type { CausedBy, EventEnvelope } from '../../contracts/envelope';
import type { DomainEvent } from '../../contracts/events';
import type { EventLog } from './EventLog';

interface ScheduledEntry {
  simTimeMs: number;
  event: DomainEvent;
  causedBy?: CausedBy;
  /** Schedule order, used as a tie-breaker so two events due at the same simTime fire in the order they were scheduled. */
  order: number;
}

/**
 * A minimal time-triggered dispatcher, deliberately a skeleton (docs/DESIGN.md's plan, roadmap
 * item "Scheduler skeleton"): queue domain events to fire at a future simulation time, then call
 * `advanceTo()` whenever the driving clock moves forward to fire everything now due, appending
 * each to the given `EventLog` in (simTime, schedule order) order. No domain logic — task
 * progression, command validation, storage accounting — lives here; that belongs to the future
 * Plan/Train workspace PRs, which decide *what* DomainEvents to schedule. This only answers
 * *when* an already-decided event fires.
 */
export class Scheduler {
  private readonly log: EventLog;
  private readonly queue: ScheduledEntry[] = [];
  private nextOrder = 0;
  private lastAdvancedMs: number;

  constructor(log: EventLog, initialSimTime: Date) {
    this.log = log;
    this.lastAdvancedMs = initialSimTime.getTime();
  }

  schedule(simTime: Date, event: DomainEvent, causedBy?: CausedBy): void {
    this.queue.push({ simTimeMs: simTime.getTime(), event, causedBy, order: this.nextOrder++ });
  }

  /**
   * Fires every scheduled event whose time has come, returning the envelopes just appended to the
   * log. A no-op (fires nothing) if `simTime` is before the last call — rewinding the clock does
   * not un-fire events already due; replaying past state from an earlier point is a session-replay
   * concern, not this scheduler's.
   */
  advanceTo(simTime: Date): EventEnvelope<DomainEvent>[] {
    const targetMs = simTime.getTime();
    if (targetMs < this.lastAdvancedMs) return [];
    this.lastAdvancedMs = targetMs;

    const due: ScheduledEntry[] = [];
    const remaining: ScheduledEntry[] = [];
    for (const entry of this.queue) {
      (entry.simTimeMs <= targetMs ? due : remaining).push(entry);
    }
    due.sort((a, b) => a.simTimeMs - b.simTimeMs || a.order - b.order);
    this.queue.length = 0;
    this.queue.push(...remaining);

    return due.map((entry) =>
      this.log.append({
        stream: 'domain',
        event: entry.event,
        simTime: new Date(entry.simTimeMs),
        causedBy: entry.causedBy,
      }),
    );
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
