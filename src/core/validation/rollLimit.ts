import type { SatelliteProfile } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';

const RAD_TO_DEG = 180 / Math.PI;

export interface ImagingRollCandidate {
  taskId: string;
  targetId: string;
  /**
   * Off-nadir angle for this candidate imaging pass, radians — the same quantity
   * `core/imaging/geometry.ts`'s `offNadirAngle` computes from a propagated satellite position
   * and a target point.
   */
  offNadirAngleRad: number;
}

/**
 * The second concrete Validator rule (docs/design/operator-simulation.md, following
 * `checkStorageBudget`): does an imaging candidate's off-nadir angle exceed the satellite's
 * `imaging.maxRollDeg` limit? Returns `null` when within limit (inclusive — exactly at the limit
 * is allowed), or an `IMG_ROLL_EXCEEDS_LIMIT` `HardBlock` finding otherwise — there is no waiver
 * for a physically unreachable roll angle.
 *
 * Deliberately takes the off-nadir angle as an already-computed input rather than propagating the
 * satellite and computing it here itself: that needs SGP4 + a target + a time, which is
 * `ForecastService`/`core/imaging/geometry.ts`'s job, not this rule's. Keeping the rule itself
 * pure and time-independent matches `checkStorageBudget`'s pattern of taking an already-sized
 * `DataProduct` candidate rather than deriving its size.
 */
export function checkRollLimit(profile: SatelliteProfile, candidate: ImagingRollCandidate): ValidationFinding | null {
  const rollDeg = candidate.offNadirAngleRad * RAD_TO_DEG;
  if (rollDeg <= profile.imaging.maxRollDeg) return null;

  return {
    code: 'IMG_ROLL_EXCEEDS_LIMIT',
    severity: 'HardBlock',
    message: `Target "${candidate.targetId}" requires a ${rollDeg.toFixed(1)}° roll, exceeding the satellite's ${profile.imaging.maxRollDeg}° limit`,
    why: `This pass's off-nadir angle is ${rollDeg.toFixed(2)}°, which exceeds the profile's maxRollDeg (${profile.imaging.maxRollDeg}°) — the satellite cannot physically point this far off nadir.`,
    affectedEntities: [
      { kind: 'task', id: candidate.taskId },
      { kind: 'target', id: candidate.targetId },
    ],
    waivable: false,
    // maxRollDeg's own provenance in the Asteria-1 profile table (src/contracts/asteria1.ts) —
    // this finding is driven directly by that assumed limit, not a derived quantity.
    provenance: 'assumed',
    source: 'rules/roll-limit@1',
  };
}
