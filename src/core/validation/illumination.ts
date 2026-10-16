import type { SatelliteProfile } from '../../contracts/domain';
import type { ValidationFinding } from '../../contracts/validation';

/** Compare forecast solar elevation with the scenario's assumed optical-imaging threshold. */
export function checkIllumination(
  profile: SatelliteProfile,
  candidate: { taskId: string; targetId: string; sunElevationDeg: number },
): ValidationFinding | null {
  const minimum = profile.imaging.sunElevationConstraintDeg;
  if (Number.isFinite(candidate.sunElevationDeg) && candidate.sunElevationDeg >= minimum) return null;
  return {
    code: 'IMG_INSUFFICIENT_LIGHT',
    severity: 'HardBlock',
    message: `Sun elevation ${candidate.sunElevationDeg.toFixed(1)}° is below the ${minimum}° imaging requirement`,
    why: 'The forecast solar elevation at capture must meet the optical-imaging threshold in this training profile.',
    affectedEntities: [
      { kind: 'task', id: candidate.taskId },
      { kind: 'target', id: candidate.targetId },
    ],
    waivable: false,
    provenance: 'assumed',
    source: 'rules/illumination@1',
  };
}
