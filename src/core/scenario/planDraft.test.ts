import { describe, expect, it } from 'vitest';
import { ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TARGETS, ASTERIA_1_TLE } from '../../contracts/asteria1';
import type { ImagingOpportunity } from '../imaging/opportunities';
import { findImagingOpportunities } from '../imaging/opportunities';
import type { TargetPoint } from '../imaging/geometry';
import { tleToElementSet } from '../tle/omm';
import { checkRollLimit } from '../validation/rollLimit';
import type { ImagingPlanCandidate } from './planDraft';
import { evaluatePlanDraft } from './planDraft';

const start = new Date(ASTERIA_1_SCENARIO.startTime);
const deg2rad = (d: number) => (d * Math.PI) / 180;

function fakeOpportunity(offNadirDeg: number, offsetS: number): ImagingOpportunity {
  const time = new Date(start.getTime() + offsetS * 1000);
  return {
    time,
    start: time,
    end: time,
    offNadirDeg,
    sunElevationDeg: 45,
    satelliteSunlit: true,
    direction: 'ascending',
    side: 'right',
    daylight: true,
    continuesAfterEnd: false,
  };
}

function candidate(id: string, offNadirDeg: number, offsetS: number): ImagingPlanCandidate {
  return { id, targetId: 'target-1', opportunity: fakeOpportunity(offNadirDeg, offsetS), mode: 'PAN' };
}

describe('evaluatePlanDraft', () => {
  it('a single clean candidate has no findings and its real product size counted', () => {
    const evaluated = evaluatePlanDraft(ASTERIA_1_PROFILE, [candidate('c1', 5, 0)]);
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0].findings).toEqual([]);
    expect(evaluated[0].cumulativeStorageUsedGB).toBeCloseTo(1.2, 5);
  });

  it('accumulates storage across candidates, blocking the one that pushes past the real budget', () => {
    // Asteria-1: 6 GB usable, 1.2 GB per PAN product (src/contracts/asteria1.ts) -> 5 fit exactly
    // at the boundary (inclusive), a 6th does not. All at offNadirDeg 5 (well within the 30 deg
    // roll limit) so only storage accumulation is under test here.
    const candidates = Array.from({ length: 6 }, (_, i) => candidate(`c${i}`, 5, i * 100));
    const evaluated = evaluatePlanDraft(ASTERIA_1_PROFILE, candidates);

    for (let i = 0; i < 5; i++) expect(evaluated[i].findings).toEqual([]);
    expect(evaluated[4].cumulativeStorageUsedGB).toBeCloseTo(6.0, 5);

    expect(evaluated[5].findings).not.toEqual([]);
    expect(evaluated[5].findings[0]).toMatchObject({ code: 'STORAGE_INSUFFICIENT', severity: 'HardBlock' });
    // The blocked candidate doesn't add to the running total.
    expect(evaluated[5].cumulativeStorageUsedGB).toBeCloseTo(6.0, 5);
  });

  it('a roll-limited candidate does not count toward storage for the candidates after it', () => {
    // If the roll-blocked candidate's 1.2 GB were wrongly counted, the 5 valid candidates after it
    // (6 GB total) would exceed the 6 GB budget. They don't, because a blocked candidate is never
    // treated as captured.
    const candidates = [
      candidate('blocked', 40, 0), // 40deg > 30deg maxRollDeg -> IMG_ROLL_EXCEEDS_LIMIT
      ...Array.from({ length: 5 }, (_, i) => candidate(`ok${i}`, 5, (i + 1) * 100)),
    ];
    const evaluated = evaluatePlanDraft(ASTERIA_1_PROFILE, candidates);

    expect(evaluated[0].findings.some((f) => f.code === 'IMG_ROLL_EXCEEDS_LIMIT')).toBe(true);
    expect(evaluated[0].cumulativeStorageUsedGB).toBe(0);
    for (let i = 1; i <= 5; i++) expect(evaluated[i].findings).toEqual([]);
    expect(evaluated[5].cumulativeStorageUsedGB).toBeCloseTo(6.0, 5);
  });

  it('real-integration: six real clean opportunities over Asteria-1s actual geometry accumulate to a real STORAGE_INSUFFICIENT on the sixth', () => {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const [target] = ASTERIA_1_TARGETS;
    if (!target) throw new Error('expected the asteria1 fixture to define an imaging target');
    const targetPoint: TargetPoint = {
      latitude: deg2rad(target.latitudeDeg),
      longitude: deg2rad(target.longitudeDeg),
      heightKm: 0,
    };
    const opportunities = findImagingOpportunities(satrec, targetPoint, start, 30, { maxOffNadirDeg: 45 });
    const clean = opportunities.filter(
      (o) =>
        checkRollLimit(ASTERIA_1_PROFILE, {
          taskId: 't',
          targetId: target.id,
          offNadirAngleRad: deg2rad(o.offNadirDeg),
        }) === null,
    );
    expect(clean.length).toBeGreaterThanOrEqual(6);

    const candidates: ImagingPlanCandidate[] = clean.slice(0, 6).map((opportunity, i) => ({
      id: `real-${i}`,
      targetId: target.id,
      opportunity,
      mode: 'PAN',
    }));
    const evaluated = evaluatePlanDraft(ASTERIA_1_PROFILE, candidates);

    expect(evaluated.slice(0, 5).every((e) => e.findings.length === 0)).toBe(true);
    expect(evaluated[5].findings.some((f) => f.code === 'STORAGE_INSUFFICIENT')).toBe(true);
  });
});
