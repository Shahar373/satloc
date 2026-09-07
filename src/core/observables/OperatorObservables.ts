import type { EventEnvelope } from '../../contracts/envelope';
import type { SatelliteProfile } from '../../contracts/domain';
import type { DomainEvent } from '../../contracts/events';

export interface OperatorObservables {
  /**
   * Contact ids the operator's console currently shows as live. A `ContactAcquired@1` alone isn't
   * enough — the console only confirms a contact once `profile.downlink.acquisitionS` seconds of
   * simulated time have passed since acquisition (the same lock-on delay `downlinkGB` already
   * subtracts from a contact's useful duration), and stops showing it the instant `ContactLost@1`
   * fires. Deliberately a subset of, and always lagging, `TruthState.activeContactIds` — see
   * "Truth State vs Operator Observables" (docs/design/operator-simulation.md).
   */
  confirmedContactIds: string[];
}

/**
 * Derives what the operator's console would currently show from the real domain event stream, as
 * of `atSimTime` — the first concrete Operator Observables computation (the split was documented
 * from `TruthState`'s own introduction, PR #31, but never implemented until now).
 *
 * Only tracks contact confirmation so far, the one lag `docs/design/operator-simulation.md`
 * already calls out by name ("a contact not yet confirmed on the ground-station link"). Storage
 * internals the console doesn't expose, and operator-only annotations like a waived warning, stay
 * unmodeled until a real Plan/Debrief PR actually needs them — inventing their shape here without
 * a consumer would be guessing, not deciding.
 *
 * `records` is the domain stream only (`domainRecords(log.records)`) — this reads exactly the
 * same event history `TruthState.foldTruthState` folds, just filtered and time-gated rather than
 * folded unconditionally, so the two are always computed from one shared source of truth.
 */
export function computeOperatorObservables(
  records: readonly EventEnvelope<DomainEvent>[],
  profile: SatelliteProfile,
  atSimTime: Date,
): OperatorObservables {
  const latestByContact = new Map<string, { kind: 'acquired' | 'lost'; at: Date }>();
  for (const record of records) {
    if (record.event.type === 'ContactAcquired@1') {
      latestByContact.set(record.event.contactId, { kind: 'acquired', at: new Date(record.simTime) });
    } else if (record.event.type === 'ContactLost@1') {
      latestByContact.set(record.event.contactId, { kind: 'lost', at: new Date(record.simTime) });
    }
  }

  const confirmedContactIds: string[] = [];
  for (const [contactId, latest] of latestByContact) {
    if (latest.kind !== 'acquired') continue;
    const confirmedAt = new Date(latest.at.getTime() + profile.downlink.acquisitionS * 1000);
    if (confirmedAt <= atSimTime) confirmedContactIds.push(contactId);
  }

  return { confirmedContactIds };
}
