import type { SatRec } from 'satellite.js';
import type { ImagingTarget, SatelliteProfile } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';
import type { ImagingOpportunity } from '../imaging/opportunities';
import { findImagingOpportunities } from '../imaging/opportunities';
import type { TargetPoint } from '../imaging/geometry';
import { checkImagingWindow } from '../validation/imagingWindow';
import { checkRollLimit } from '../validation/rollLimit';

export interface EvaluatedOpportunity {
  opportunity: ImagingOpportunity;
  /** Empty means this opportunity is clean under the rules evaluated here. */
  findings: ValidationFinding[];
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Computes real imaging opportunities for `target` over the next `days` and evaluates each one
 * against the Validator rules that depend only on the candidate itself (`checkRollLimit`,
 * `checkImagingWindow`) — a "browse mode" for the Plan workspace: what could an operator pick,
 * and would it be physically valid, before any plan actually exists to commit.
 *
 * Deliberately does not evaluate `checkStorageBudget` or `checkContactTiming` here: both need
 * state this module has no access to — an actual accumulated plan (so far unmodeled; a candidate
 * evaluated alone against an empty Truth State would always trivially fit) for storage, and a
 * real domain event log with recorded contact acquisition for timing. Both stay meaningful only
 * once a real Plan/commit flow exists to evaluate against, which this module doesn't build.
 */
export function evaluateImagingOpportunities(
  satrec: SatRec,
  profile: SatelliteProfile,
  target: ImagingTarget,
  searchStart: Date,
  days = 30,
): EvaluatedOpportunity[] {
  const targetPoint: TargetPoint = {
    latitude: deg2rad(target.latitudeDeg),
    longitude: deg2rad(target.longitudeDeg),
    heightKm: 0,
  };
  const opportunities = findImagingOpportunities(satrec, targetPoint, searchStart, days, { maxOffNadirDeg: 45 });

  return opportunities.map((opportunity) => {
    const findings: ValidationFinding[] = [];

    const rollFinding = checkRollLimit(profile, {
      taskId: `candidate-${opportunity.start.toISOString()}`,
      targetId: target.id,
      offNadirAngleRad: deg2rad(opportunity.offNadirDeg),
    });
    if (rollFinding) findings.push(rollFinding);

    const windowFinding = checkImagingWindow(opportunities, {
      taskId: `candidate-${opportunity.start.toISOString()}`,
      targetId: target.id,
      simTime: opportunity.time,
    });
    if (windowFinding) findings.push(windowFinding);

    return { opportunity, findings };
  });
}
