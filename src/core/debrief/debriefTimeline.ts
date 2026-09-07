import { domainRecords, type EventEnvelope } from '../../contracts/envelope';
import type { SatelliteProfile } from '../../contracts/domain';
import type { DomainEvent } from '../../contracts/events';
import { computeOperatorObservables, type OperatorObservables } from '../observables/OperatorObservables';
import { applyDomainEvent, initialTruthState, type TruthState } from '../truth/TruthState';

export interface DebriefRow {
  simTime: Date;
  event: DomainEvent;
  /** TruthState right after folding this event (and everything before it). */
  truth: TruthState;
  /** OperatorObservables as of this event's own simTime, from the domain records seen so far. */
  observables: OperatorObservables;
}

/**
 * Builds a step-by-step Debrief timeline from a run's recorded events: one row per DomainEvent,
 * each carrying the real `TruthState` right after that event alongside the real
 * `OperatorObservables` computed at that same simTime — side by side, so a viewer can see exactly
 * where the two diverge (e.g. a `ContactAcquired@1` row where Truth already shows the contact
 * active but Observables hasn't confirmed it yet — the lag `docs/design/operator-simulation.md`'s
 * "Truth State vs Operator Observables" section documents by name).
 *
 * Takes the full record list (any stream) rather than requiring the caller to pre-filter, the same
 * as `ScenarioRunner.truth` does — `domainRecords` picks out the domain stream internally.
 */
export function buildDebriefTimeline(records: readonly EventEnvelope[], profile: SatelliteProfile): DebriefRow[] {
  const domain = domainRecords(records);
  const rows: DebriefRow[] = [];
  let truth = initialTruthState();

  for (let i = 0; i < domain.length; i++) {
    const record = domain[i];
    truth = applyDomainEvent(truth, record.event);
    const seenSoFar = domain.slice(0, i + 1);
    const observables = computeOperatorObservables(seenSoFar, profile, new Date(record.simTime));
    rows.push({ simTime: new Date(record.simTime), event: record.event, truth, observables });
  }

  return rows;
}
