import type { DataProduct, ImagingMode, SatelliteProfile } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';
import type { ImagingOpportunity } from '../imaging/opportunities';
import { checkContactCapacity } from '../validation/contactCapacity';
import { checkImagingWindow } from '../validation/imagingWindow';
import { checkRollLimit } from '../validation/rollLimit';
import { checkStorageBudget } from '../validation/storageBudget';
import { applyDomainEvent, initialTruthState } from '../truth/TruthState';

export interface ImagingPlanCandidate {
  kind: 'imaging';
  id: string;
  targetId: string;
  /** The specific real opportunity chosen for this candidate (from `findImagingOpportunities`). */
  opportunity: ImagingOpportunity;
  mode: ImagingMode;
}

export interface DownlinkPlanCandidate {
  kind: 'downlink';
  id: string;
  contactId: string;
  /** Duration of the real ground contact (a `Pass`, `src/core/passes/predict.ts`) chosen for this downlink. */
  durationS: number;
  /**
   * Ids of earlier `ImagingPlanCandidate`s in this same draft whose stored data products this
   * downlink is meant to clear — the causal link between an imaging candidate and the downlink
   * that clears what it captured.
   */
  dataProductCandidateIds: string[];
}

export type PlanCandidate = ImagingPlanCandidate | DownlinkPlanCandidate;

export interface EvaluatedPlanCandidate {
  candidate: PlanCandidate;
  /** Empty means this candidate is clean, assuming every earlier candidate in the plan is accepted. */
  findings: ValidationFinding[];
  /** Onboard storage after this candidate, counting it only if `findings` is empty (see below). */
  cumulativeStorageUsedGB: number;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Evaluates an ordered list of plan candidates — imaging and downlink — as a draft plan: each
 * imaging candidate's own physical validity (`checkRollLimit`/`checkImagingWindow` against the
 * specific opportunity chosen for it) plus a running storage total across the whole sequence
 * (`checkStorageBudget`, accumulated via the real `applyDomainEvent` fold as if every earlier
 * accepted candidate actually happened); each downlink candidate's real contact capacity
 * (`checkContactCapacity`) against the specific data products it's assigned to clear, plus a causal
 * check that those products actually exist onboard at that point in the sequence — this is the
 * first real multi-candidate use of the Validator rules, rather than each rule seeing one candidate
 * against an empty or already-current Truth State in isolation.
 *
 * A candidate with any finding does not count toward storage for the candidates after it — a plan
 * that can't commit a capture doesn't actually put anything in storage for it, and a downlink that
 * can't clear its assigned products doesn't actually free anything either.
 *
 * A downlink candidate can only reference data products produced by an *earlier*, *accepted*
 * imaging candidate in this same draft (`DOWNLINK_PRODUCT_MISSING`, the causal-ordering check this
 * function itself owns, not a separate rule module — it needs this accumulator's own bookkeeping of
 * what's stored at each point, not just one candidate's inputs). Referencing a product that was
 * never captured, was blocked by an earlier finding, or has already been cleared by an earlier
 * downlink in this same draft, all fail the same way: nothing to actually downlink.
 */
export function evaluatePlanDraft(
  profile: SatelliteProfile,
  candidates: readonly PlanCandidate[],
): EvaluatedPlanCandidate[] {
  let truth = initialTruthState();
  const storedByCandidateId = new Map<string, DataProduct>();
  const evaluated: EvaluatedPlanCandidate[] = [];

  for (const candidate of candidates) {
    const findings: ValidationFinding[] = [];

    if (candidate.kind === 'imaging') {
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
      const dataProduct: DataProduct = { id: candidate.id, taskId: candidate.id, mode: candidate.mode, sizeGB };
      const storageFinding = checkStorageBudget(profile, truth, dataProduct);
      if (storageFinding) findings.push(storageFinding);

      if (findings.length === 0) {
        truth = applyDomainEvent(truth, { type: 'DataProductStored@1', dataProduct });
        storedByCandidateId.set(candidate.id, dataProduct);
      }
    } else {
      const dataProducts: DataProduct[] = [];
      let missingId: string | null = null;
      for (const refId of candidate.dataProductCandidateIds) {
        const product = storedByCandidateId.get(refId);
        if (!product) {
          missingId = refId;
          break;
        }
        dataProducts.push(product);
      }

      if (missingId !== null) {
        findings.push({
          code: 'DOWNLINK_PRODUCT_MISSING',
          severity: 'HardBlock',
          message: `Data product from candidate "${missingId}" is not stored onboard at this point in the plan`,
          why: `"${missingId}" was never captured earlier in this draft, was blocked by an earlier finding, or has already been cleared by an earlier downlink candidate — a downlink can only clear a product actually onboard at the moment it runs`,
          affectedEntities: [
            { kind: 'contact', id: candidate.contactId },
            { kind: 'dataProduct', id: missingId },
          ],
          waivable: false,
          provenance: 'calculated',
          source: 'plan-draft/causal-ordering',
        });
      } else {
        const capacityFinding = checkContactCapacity(profile, {
          contactId: candidate.contactId,
          durationS: candidate.durationS,
          dataProducts,
        });
        if (capacityFinding) findings.push(capacityFinding);
      }

      if (findings.length === 0) {
        for (const product of dataProducts) {
          truth = applyDomainEvent(truth, {
            type: 'DownlinkCompleted@1',
            contactId: candidate.contactId,
            dataProductId: product.id,
            mode: product.mode,
          });
        }
        for (const refId of candidate.dataProductCandidateIds) storedByCandidateId.delete(refId);
      }
    }

    evaluated.push({ candidate, findings, cumulativeStorageUsedGB: truth.storageUsedGB });
  }

  return evaluated;
}
