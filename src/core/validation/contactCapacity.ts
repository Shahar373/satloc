import type { DataProduct, SatelliteProfile } from '../../contracts/domain';
import { downlinkGB } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';

export interface ContactCapacityCandidate {
  contactId: string;
  /** Duration of the real ground contact (a `Pass`, `src/core/passes/predict.ts`) chosen for this downlink. */
  durationS: number;
  /** The data products this downlink is meant to clear during that one contact. */
  dataProducts: readonly DataProduct[];
}

/**
 * Would this contact's real downlink capacity (`downlinkGB`, which already subtracts the
 * acquisition lock-on delay) actually clear everything `candidate.dataProducts` asks for? Returns
 * `null` when it fits (including exactly at capacity), or a `CONTACT_TOO_SHORT_FOR_PRODUCT`
 * `HardBlock` finding when it doesn't — a ground contact's duration is physical fact, not a
 * judgment call, so this is never waivable.
 *
 * Deliberately takes the contact's duration and the target data products as plain inputs rather
 * than a `Pass`/`EvaluatedPlanCandidate` directly: keeps this rule reusable from both a real
 * `predictPasses` result and a plan draft accumulator's own bookkeeping, the same way
 * `checkRollLimit`/`checkImagingWindow` take pre-computed angles/opportunities rather than
 * recomputing geometry themselves.
 */
export function checkContactCapacity(
  profile: SatelliteProfile,
  candidate: ContactCapacityCandidate,
): ValidationFinding | null {
  const neededGB = candidate.dataProducts.reduce((sum, product) => sum + product.sizeGB, 0);
  const capacityGB = downlinkGB(profile, candidate.durationS);
  if (neededGB <= capacityGB) return null;

  const productIds = candidate.dataProducts.map((product) => product.id).join(', ');
  return {
    code: 'CONTACT_TOO_SHORT_FOR_PRODUCT',
    severity: 'HardBlock',
    message: `Contact "${candidate.contactId}" (${candidate.durationS.toFixed(0)} s) can downlink ${capacityGB.toFixed(3)} GB, but the assigned products need ${neededGB.toFixed(3)} GB`,
    why: `downlinkGB = ${profile.downlink.rateMbps} Mbps * max(0, ${candidate.durationS.toFixed(0)} s - ${profile.downlink.acquisitionS} s acquisition) / 8000 = ${capacityGB.toFixed(3)} GB, which is less than the ${neededGB.toFixed(3)} GB requested by [${productIds}]`,
    affectedEntities: [
      { kind: 'contact', id: candidate.contactId },
      ...candidate.dataProducts.map((product) => ({ kind: 'dataProduct' as const, id: product.id })),
    ],
    waivable: false,
    provenance: 'calculated',
    source: 'rules/contact-capacity@1',
  };
}
