import { describe, expect, it } from 'vitest';
import {
  ASTERIA_1_GROUND_STATIONS,
  ASTERIA_1_PROFILE,
  ASTERIA_1_SCENARIO,
  ASTERIA_1_TLE,
} from '../../contracts/asteria1';
import { findImagingOpportunities } from '../imaging/opportunities';
import type { TargetPoint } from '../imaging/geometry';
import { tleToElementSet } from '../tle/omm';
import { checkRollLimit } from './rollLimit';

const deg2rad = (d: number) => (d * Math.PI) / 180;

// Asteria-1's maxRollDeg is 30 (src/contracts/asteria1.ts).
const candidate = (offNadirDeg: number) => ({
  taskId: 'task-1',
  targetId: 'target-1',
  offNadirAngleRad: deg2rad(offNadirDeg),
});

describe('checkRollLimit', () => {
  it('returns null when the off-nadir angle is comfortably within the limit', () => {
    expect(checkRollLimit(ASTERIA_1_PROFILE, candidate(15))).toBeNull();
  });

  it('returns null exactly at the limit (inclusive boundary)', () => {
    expect(checkRollLimit(ASTERIA_1_PROFILE, candidate(30))).toBeNull();
  });

  it('returns an IMG_ROLL_EXCEEDS_LIMIT HardBlock finding when the angle exceeds the limit', () => {
    const finding = checkRollLimit(ASTERIA_1_PROFILE, candidate(35));
    expect(finding).not.toBeNull();
    expect(finding).toMatchObject({
      code: 'IMG_ROLL_EXCEEDS_LIMIT',
      severity: 'HardBlock',
      waivable: false,
      provenance: 'assumed',
      source: 'rules/roll-limit@1',
    });
    expect(finding!.affectedEntities).toEqual([
      { kind: 'task', id: 'task-1' },
      { kind: 'target', id: 'target-1' },
    ]);
  });

  it('the why field names the actual angles involved, not just a generic message', () => {
    const finding = checkRollLimit(ASTERIA_1_PROFILE, candidate(35));
    expect(finding!.why).toContain('35.00°');
    expect(finding!.why).toContain('30°');
  });

  it('real-geometry integration: evaluates actual off-nadir angles from findImagingOpportunities against the Asteria-1 TLE, not a fabricated number', () => {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const gsHome = ASTERIA_1_GROUND_STATIONS.find((station) => station.id === 'gs-home');
    if (!gsHome) throw new Error('expected the asteria1 fixture to define gs-home');
    const target: TargetPoint = {
      latitude: deg2rad(gsHome.latitudeDeg),
      longitude: deg2rad(gsHome.longitudeDeg),
      heightKm: 0,
    };
    const start = new Date(ASTERIA_1_SCENARIO.startTime);
    const opportunities = findImagingOpportunities(satrec, target, start, 7, { maxOffNadirDeg: 45 });

    // A ~500 km SSO at 97.4° inclination reaches every latitude up to ~82.6° within 7 days, so
    // GS-Home's 31.5°N is reachable — this is a real, non-trivial propagation result, not a
    // hand-picked fixture.
    expect(opportunities.length).toBeGreaterThan(0);

    for (const opportunity of opportunities) {
      const finding = checkRollLimit(ASTERIA_1_PROFILE, {
        taskId: 'integration-task',
        targetId: gsHome.id,
        offNadirAngleRad: deg2rad(opportunity.offNadirDeg),
      });
      if (opportunity.offNadirDeg <= ASTERIA_1_PROFILE.imaging.maxRollDeg) {
        expect(finding).toBeNull();
      } else {
        expect(finding?.code).toBe('IMG_ROLL_EXCEEDS_LIMIT');
      }
    }
  });
});
