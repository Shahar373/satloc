import type { DomainEvent, OperatorAction, RunControlEvent } from './events';

export type Stream = 'domain' | 'operator' | 'run-control';

export interface CausedBy {
  recordId: string;
  globalSequence: number;
}

/**
 * The one canonical record shape for every event, in every stream, in one append-only log
 * (`SessionFile.records`). `globalSequence` is the canonical order; `domain`/`operator`/
 * `run-control` projections are always computed by filtering `records`, never stored
 * separately — see `domainRecords`/`operatorRecords`/`runControlRecords` below.
 */
export interface EventEnvelope<
  T extends DomainEvent | OperatorAction | RunControlEvent = DomainEvent | OperatorAction | RunControlEvent,
> {
  /** ULID — unique and roughly time-ordered even across sessions (see ./ulid.ts). */
  recordId: string;
  /** 1..n, contiguous, no gaps, within one session — the canonical order for replay. */
  globalSequence: number;
  /** Wall-clock ISO-8601 timestamp of when this record was appended. */
  recordedAt: string;
  /** Simulation-time ISO-8601 timestamp at the moment this record was appended. */
  simTime: string;
  stream: Stream;
  event: T;
  /** The record (if any) that caused this one — always points backward (lower globalSequence). */
  causedBy?: CausedBy;
}

export const SESSION_SCHEMA_VERSION = 1;

export interface SessionFile {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  sessionId: string;
  scenarioId: string;
  scenarioHash: string;
  seed: string;
  createdAt: string;
  /** The only source of truth stored on disk — domain/operator/run-control views are projections. */
  records: EventEnvelope[];
}

export function domainRecords(records: EventEnvelope[]): EventEnvelope<DomainEvent>[] {
  return records.filter((r): r is EventEnvelope<DomainEvent> => r.stream === 'domain');
}

export function operatorRecords(records: EventEnvelope[]): EventEnvelope<OperatorAction>[] {
  return records.filter((r): r is EventEnvelope<OperatorAction> => r.stream === 'operator');
}

export function runControlRecords(records: EventEnvelope[]): EventEnvelope<RunControlEvent>[] {
  return records.filter((r): r is EventEnvelope<RunControlEvent> => r.stream === 'run-control');
}

/**
 * Checks the invariants a session's records must hold: `globalSequence` is contiguous 1..n;
 * `simTime` never decreases between consecutive DOMAIN records (operator/run-control records can
 * go backward — that's what a seek looks like); `causedBy.globalSequence` is strictly less than
 * the record's own; and `causedBy` points at a record that actually exists at that sequence.
 * Returns a list of violation descriptions — empty means the records are internally consistent.
 */
export function validateSessionRecords(records: EventEnvelope[]): string[] {
  const violations: string[] = [];
  const byGlobalSequence = new Map(records.map((r) => [r.globalSequence, r]));

  records.forEach((record, index) => {
    const expectedSequence = index + 1;
    if (record.globalSequence !== expectedSequence) {
      violations.push(
        `record at index ${index} (${record.recordId}) has globalSequence ${record.globalSequence}, expected ${expectedSequence} (must be contiguous 1..n)`,
      );
    }
    if (record.causedBy) {
      if (!(record.causedBy.globalSequence < record.globalSequence)) {
        violations.push(
          `record ${record.recordId} (seq ${record.globalSequence}) has causedBy.globalSequence ${record.causedBy.globalSequence}, which must be less than ${record.globalSequence}`,
        );
      }
      const cause = byGlobalSequence.get(record.causedBy.globalSequence);
      if (!cause || cause.recordId !== record.causedBy.recordId) {
        violations.push(
          `record ${record.recordId} (seq ${record.globalSequence}) has causedBy pointing at a record that does not exist`,
        );
      }
    }
  });

  let lastDomainSimTimeMs: number | null = null;
  for (const record of records) {
    if (record.stream !== 'domain') continue;
    const simTimeMs = new Date(record.simTime).getTime();
    if (lastDomainSimTimeMs !== null && simTimeMs < lastDomainSimTimeMs) {
      violations.push(
        `domain record ${record.recordId} has simTime ${record.simTime}, which is before the previous domain record's simTime`,
      );
    }
    lastDomainSimTimeMs = simTimeMs;
  }

  return violations;
}
