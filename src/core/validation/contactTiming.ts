import type { DomainEvent } from '../../contracts/events';
import type { EventEnvelope } from '../../contracts/envelope';
import type { ValidationFinding } from '../../contracts/validation';

export interface ContactCommandCandidate {
  commandId: string;
  taskId: string;
  contactId: string;
  /** The simulation time this command would be issued at. */
  simTime: Date;
}

/**
 * The third concrete Validator rule (docs/design/operator-simulation.md), following
 * `checkStorageBudget` and `checkRollLimit`: does a candidate command's `simTime` fall inside its
 * target contact's actual acquisition window? Scans the domain event log for that `contactId`'s
 * `ContactAcquired@1`/`ContactLost@1` pair rather than reading a precomputed window, so it always
 * reflects what really happened (a contact can end early — a real `ContactLost@1` — not just what
 * a forecast predicted).
 *
 * Returns a `CMD_BEFORE_AOS` `HardBlock` when the contact hasn't been acquired yet at `simTime`
 * (no `ContactAcquired@1` record, or one that hasn't happened yet by then), a `CMD_AFTER_LOS`
 * `HardBlock` when it has already ended (`ContactLost@1` at or before `simTime`), or `null` when
 * `simTime` falls inside the acquired-but-not-yet-lost window. Neither is waivable — there is no
 * uplink outside an actual RF contact.
 */
export function checkContactTiming(
  records: readonly EventEnvelope<DomainEvent>[],
  candidate: ContactCommandCandidate,
): ValidationFinding | null {
  const acquired = records.find(
    (record) => record.event.type === 'ContactAcquired@1' && record.event.contactId === candidate.contactId,
  );
  const lost = records.find(
    (record) => record.event.type === 'ContactLost@1' && record.event.contactId === candidate.contactId,
  );

  const acquiredAt = acquired ? new Date(acquired.simTime) : null;
  if (!acquiredAt || acquiredAt > candidate.simTime) {
    return {
      code: 'CMD_BEFORE_AOS',
      severity: 'HardBlock',
      message: `Command for contact "${candidate.contactId}" is scheduled before acquisition of signal`,
      why: acquiredAt
        ? `Contact "${candidate.contactId}" isn't acquired until ${acquiredAt.toISOString()}, which is after this command's simTime (${candidate.simTime.toISOString()}).`
        : `Contact "${candidate.contactId}" has no recorded ContactAcquired@1 event at all — the command's simTime (${candidate.simTime.toISOString()}) precedes any acquisition.`,
      affectedEntities: [
        { kind: 'command', id: candidate.commandId },
        { kind: 'task', id: candidate.taskId },
        { kind: 'contact', id: candidate.contactId },
      ],
      waivable: false,
      provenance: 'calculated',
      source: 'rules/contact-timing@1',
    };
  }

  const lostAt = lost ? new Date(lost.simTime) : null;
  if (lostAt && lostAt <= candidate.simTime) {
    return {
      code: 'CMD_AFTER_LOS',
      severity: 'HardBlock',
      message: `Command for contact "${candidate.contactId}" is scheduled after loss of signal`,
      why: `Contact "${candidate.contactId}" was lost at ${lostAt.toISOString()}, which is at or before this command's simTime (${candidate.simTime.toISOString()}).`,
      affectedEntities: [
        { kind: 'command', id: candidate.commandId },
        { kind: 'task', id: candidate.taskId },
        { kind: 'contact', id: candidate.contactId },
      ],
      waivable: false,
      provenance: 'calculated',
      source: 'rules/contact-timing@1',
    };
  }

  return null;
}
