import type { ImagingMode, SatelliteProfile } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';
import type { ImagingOpportunity } from '../imaging/opportunities';
import { applyDomainEvent, initialTruthState } from '../truth/TruthState';
import { checkImagingWindow } from '../validation/imagingWindow';
import { checkRollLimit } from '../validation/rollLimit';
import { checkStorageBudget } from '../validation/storageBudget';

export interface ImagingPlanCandidate {
  id: string;
  targetId: string;
  /** The specific real opportunity chosen for this candidate (from `findImagingOpportunities`). */
  opportunity: ImagingOpportunity;
  mode: ImagingMode;
}

export interface EvaluatedPlanCandidate {
  candidate: ImagingPlanCandidate;
  /** Empty means this candidate is clean, assuming every earlier candidate in the plan is accepted. */
  findings: ValidationFinding[];
  /** Onboard storage after this candidate, counting it only if `findings` is empty (see below). */
  cumulativeStorageUsedGB: number;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Evaluates an ordered list of imaging candidates as a draft plan: each candidate's own physical
 * validity (`checkRollLimit`/`checkImagingWindow` against the specific opportunity chosen for it)
 * plus a running storage total across the whole sequence (`checkStorageBudget`, accumulated via
 * the real `applyDomainEvent` fold as if every earlier accepted candidate actually happened) —
 * the first real multi-candidate use of the Validator rules, rather than each rule seeing one
 * candidate against an empty or already-current Truth State in isolation (as PlanV2's browse mode
 * and TrainV2's fixed demo both still do).
 *
 * A candidate with any finding does not count toward storage for the candidates after it — a plan
 * that can't commit a capture doesn't actually put anything in storage for it, so treating it as
 * "captured anyway" would understate how much room later candidates really have.
 *
 * Deliberately imaging-only: downlink candidates need a chosen ground contact's real capacity
 * (`CONTACT_TOO_SHORT_FOR_PRODUCT` — listed in the original plan's rule table, docs/design/
 * operator-simulation.md, but not yet a built rule) and causal ordering against the imaging
 * candidates that produced what they'd downlink — real modeling, but this function doesn't
 * attempt it. A caller wanting the full Capture -> Store -> Contact -> Downlink flow still needs
 * `buildRealDemoTimeline`'s fixed story or a future downlink-candidate PR, not this.
 */
export function evaluatePlanDraft(
  profile: SatelliteProfile,
  candidates: readonly ImagingPlanCandidate[],
): EvaluatedPlanCandidate[] {
  let truth = initialTruthState();
  const evaluated: EvaluatedPlanCandidate[] = [];

  for (const candidate of candidates) {
    const findings: ValidationFinding[] = [];

    const rollFinding = checkRollLimit(profile, {
      taskId: candidate.id,
      targetId: candidate.targetId,
      offNadirAngleRad: deg2rad(candidate.opportunity.offNadirDeg),
    });
    if (rollFinding) findings.push(rollFinding);

    const windowFinding = checkImagingWindow([candidate.opportunity], {
      taskId: candidate.id,
      targetId: candidate.targetId,
      simTime: candidate.opportunity.time,
    });
    if (windowFinding) findings.push(windowFinding);

    const sizeGB = profile.storage.productGB[candidate.mode];
    const dataProduct = { id: candidate.id, taskId: candidate.id, mode: candidate.mode, sizeGB };
    const storageFinding = checkStorageBudget(profile, truth, dataProduct);
    if (storageFinding) findings.push(storageFinding);

    if (findings.length === 0) {
      truth = applyDomainEvent(truth, { type: 'DataProductStored@1', dataProduct });
    }

    evaluated.push({ candidate, findings, cumulativeStorageUsedGB: truth.storageUsedGB });
  }

  return evaluated;
}
