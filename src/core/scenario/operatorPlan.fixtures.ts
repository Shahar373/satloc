// Synthetic timing fixtures for orchestration tests, not independent orbital reference data.
import { ASTERIA_1_SCENARIO } from '../../contracts/asteria1';
import type { ImagingMode } from '../../contracts/domain';
import type { ImagingPlanCandidate } from './planDraft';
import type { ScheduledDownlinkCandidate } from './executablePlan';

export const at = (seconds: number) => new Date(new Date(ASTERIA_1_SCENARIO.startTime).getTime() + seconds * 1000);
export function capture(id = 'image-1', seconds = 60, mode: ImagingMode = 'PAN'): ImagingPlanCandidate {
  return {
    kind: 'imaging',
    id,
    targetId: 'target-1',
    mode,
    elementSetAgeDays: 0,
    opportunity: {
      start: at(seconds),
      time: at(seconds + 10),
      end: at(seconds + 20),
      offNadirDeg: 5,
      sunElevationDeg: 45,
      satelliteSunlit: true,
      direction: 'ascending',
      side: 'right',
      daylight: true,
      continuesAfterEnd: false,
    },
  };
}
export function contact(
  id = 'downlink-1',
  products = ['image-1'],
  seconds = 1000,
  durationS = 100,
): ScheduledDownlinkCandidate {
  return {
    kind: 'downlink',
    id,
    contactId: `contact:${id}`,
    stationId: 'gs-home',
    durationS,
    dataProductCandidateIds: products,
    pass: {
      aos: at(seconds),
      tca: at(seconds + durationS / 2),
      los: at(seconds + durationS),
      durationS,
      maxElevationDeg: 50,
      aosAzimuthDeg: 0,
      tcaAzimuthDeg: 90,
      losAzimuthDeg: 180,
      inProgressAtStart: false,
      continuesAfterEnd: false,
    },
  };
}
