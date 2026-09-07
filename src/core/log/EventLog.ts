import type { CausedBy, EventEnvelope, Stream } from '../../contracts/envelope';
import { validateSessionRecords } from '../../contracts/envelope';
import type { DomainEvent, OperatorAction, RunControlEvent } from '../../contracts/events';
import { generateUlid } from '../../contracts/ulid';

export interface AppendInput<T extends DomainEvent | OperatorAction | RunControlEvent> {
  stream: Stream;
  event: T;
  /** Simulation time at the moment this record is recorded — the caller's clock, not this class's. */
  simTime: Date;
  causedBy?: CausedBy;
}

/**
 * The append-only log of `EventEnvelope`s described in docs/DESIGN.md's operator-simulation plan
 * (§3): `globalSequence` is assigned by construction (always the next index, so it can never have
 * a gap), `recordId` is a fresh ULID, and every append is checked against
 * `validateSessionRecords` — a record that would violate a session invariant (most notably,
 * simulation time going backward between consecutive domain records) is rejected before it's
 * ever added, rather than silently corrupting the log for something to catch later.
 */
export class EventLog {
  private readonly recordsList: EventEnvelope[] = [];
  private readonly now: () => Date;

  /** `now` is injectable for deterministic tests; production callers omit it and get the real wall clock. */
  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  get records(): readonly EventEnvelope[] {
    return this.recordsList;
  }

  /** Throws if the new record would violate a session invariant (see `validateSessionRecords`); the log is unchanged in that case. */
  append<T extends DomainEvent | OperatorAction | RunControlEvent>(input: AppendInput<T>): EventEnvelope<T> {
    const envelope: EventEnvelope<T> = {
      recordId: generateUlid(this.now()),
      globalSequence: this.recordsList.length + 1,
      recordedAt: this.now().toISOString(),
      simTime: input.simTime.toISOString(),
      stream: input.stream,
      event: input.event,
      ...(input.causedBy ? { causedBy: input.causedBy } : {}),
    };
    const candidate = [...this.recordsList, envelope as EventEnvelope];
    const violations = validateSessionRecords(candidate);
    if (violations.length > 0) {
      throw new Error(`EventLog.append: would violate session invariants: ${violations.join('; ')}`);
    }
    this.recordsList.push(envelope);
    return envelope;
  }
}
