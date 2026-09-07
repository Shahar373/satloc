import { domainRecords, type EventEnvelope } from '../../contracts/envelope';
import type { DomainEvent } from '../../contracts/events';

/**
 * One domain record with every field that legitimately varies between otherwise-identical runs
 * stripped out (`recordId` — a fresh ULID per run; `recordedAt` — real wall-clock time;
 * `globalSequence` — can differ if operator/run-control records are interleaved differently), so
 * two runs of the same scenario/seed/schedule produce byte-identical canonical output even though
 * their raw `EventEnvelope`s never will. `sequence` replaces `globalSequence` with the record's
 * 1-based position within the domain-only projection specifically (docs/design/operator-
 * simulation.md's "EventLog determinism" note: "the hash ignores recordId/recordedAt, compares
 * globalSequence relative within the domain projection").
 */
export interface CanonicalDomainRecord {
  sequence: number;
  simTime: string;
  event: DomainEvent;
}

/** The domain-only projection of `records`, canonicalized for run-to-run comparison. */
export function canonicalDomainProjection(records: readonly EventEnvelope[]): CanonicalDomainRecord[] {
  return domainRecords(records).map((record, index) => ({
    sequence: index + 1,
    simTime: record.simTime,
    event: record.event,
  }));
}

/**
 * A deterministic (FNV-1a, 32-bit) hash of the canonical domain projection's JSON — not
 * cryptographic, just stable and sensitive enough to catch a real behavior change between runs or
 * code versions in a golden-regression test (docs/DESIGN's/plan's §6 "EventLog determinism" row).
 * Written from scratch rather than pulling in a hashing dependency, the same call this codebase
 * already made for ULID generation (`src/contracts/ulid.ts`).
 */
export function canonicalDomainHash(records: readonly EventEnvelope[]): string {
  const json = JSON.stringify(canonicalDomainProjection(records));
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a 32-bit prime
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
