import type { DataProduct, SatelliteProfile } from '../../contracts/domain';
import { usableStorageGB } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';
import type { TruthState } from '../truth/TruthState';

/**
 * The first concrete Validator rule (docs/design/operator-simulation.md): would storing
 * `candidate` push onboard storage past the satellite's usable budget, given what Truth State
 * says is already stored? Returns `null` when there's room (including exactly at the limit — the
 * budget is inclusive), or a `STORAGE_INSUFFICIENT` `HardBlock` finding when it's not.
 *
 * Deliberately narrow: this checks storage capacity only. Imaging-window, roll-limit, and
 * contact-timing rules need `ForecastService`/imaging-geometry integration and belong in their
 * own future rule modules, not bolted onto this one.
 */
export function checkStorageBudget(
  profile: SatelliteProfile,
  truth: TruthState,
  candidate: DataProduct,
): ValidationFinding | null {
  const usableGB = usableStorageGB(profile);
  const projectedGB = truth.storageUsedGB + candidate.sizeGB;
  if (projectedGB <= usableGB) return null;

  return {
    code: 'STORAGE_INSUFFICIENT',
    severity: 'HardBlock',
    message: `Storing "${candidate.id}" would use ${projectedGB.toFixed(3)} GB of the ${usableGB} GB usable budget`,
    why: `${truth.storageUsedGB.toFixed(3)} GB already stored onboard + ${candidate.sizeGB} GB for this product = ${projectedGB.toFixed(3)} GB, which exceeds the profile's usable storage (rawGB ${profile.storage.rawGB} − reservedGB ${profile.storage.reservedGB} = ${usableGB} GB)`,
    affectedEntities: [
      { kind: 'dataProduct', id: candidate.id },
      { kind: 'task', id: candidate.taskId },
    ],
    waivable: false,
    // usableStorageGB(profile) is itself a *calculated* quantity (rawGB - reservedGB) — this
    // finding is about that derived number, not any one raw profile field, so 'calculated' is
    // correct regardless of how a given profile happens to key its own provenance table.
    provenance: 'calculated',
    source: 'rules/storage-budget@1',
  };
}
