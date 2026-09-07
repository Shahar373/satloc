import type { ImagingOpportunity } from '../imaging/opportunities';
import type { ValidationFinding } from '../../contracts/validation';

export interface ImagingWindowCandidate {
  taskId: string;
  targetId: string;
  /** The simulation time this imaging command would fire at. */
  simTime: Date;
}

/**
 * The fourth concrete Validator rule (docs/design/operator-simulation.md), completing the
 * original HardBlock code list alongside `checkStorageBudget`, `checkRollLimit`, and
 * `checkContactTiming`: does a candidate imaging command's `simTime` fall inside one of the
 * satellite's actual access windows for that target? Returns an `IMG_OUTSIDE_WINDOW` `HardBlock`
 * finding if not (not waivable — an access window is physical geometry, not a judgment call),
 * `null` if `simTime` falls inside any opportunity's `[start, end]` window (inclusive).
 *
 * Takes the candidate's forecast opportunities as an already-computed input — the same
 * `ImagingOpportunity[]` `core/imaging/opportunities.ts`'s `findImagingOpportunities` produces —
 * rather than propagating the satellite itself, matching `checkRollLimit`'s pattern of staying
 * pure and time-independent.
 */
export function checkImagingWindow(
  opportunities: readonly ImagingOpportunity[],
  candidate: ImagingWindowCandidate,
): ValidationFinding | null {
  const withinWindow = opportunities.some(
    (opportunity) => candidate.simTime >= opportunity.start && candidate.simTime <= opportunity.end,
  );
  if (withinWindow) return null;

  const distanceToMs = (opportunity: ImagingOpportunity) =>
    Math.min(
      Math.abs(candidate.simTime.getTime() - opportunity.start.getTime()),
      Math.abs(candidate.simTime.getTime() - opportunity.end.getTime()),
    );
  const nearest = opportunities.reduce<ImagingOpportunity | null>(
    (closest, opportunity) => (closest && distanceToMs(closest) <= distanceToMs(opportunity) ? closest : opportunity),
    null,
  );

  return {
    code: 'IMG_OUTSIDE_WINDOW',
    severity: 'HardBlock',
    message: `Target "${candidate.targetId}" has no imaging access at ${candidate.simTime.toISOString()}`,
    why: nearest
      ? `No forecast imaging opportunity covers ${candidate.simTime.toISOString()}; the nearest is ${nearest.start.toISOString()} – ${nearest.end.toISOString()}.`
      : `No forecast imaging opportunities exist for target "${candidate.targetId}" at all in the window that was searched.`,
    affectedEntities: [
      { kind: 'task', id: candidate.taskId },
      { kind: 'target', id: candidate.targetId },
    ],
    waivable: false,
    provenance: 'calculated',
    source: 'rules/imaging-window@1',
  };
}
