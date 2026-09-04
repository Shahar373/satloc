import { describe, expect, it } from 'vitest';
import { EROS_LIKE_OMM } from './fixtures';
import { elementSetAgeDays, ommToElementSet, satrecEpochDate, tleToElementSet } from './omm';

describe('ommToElementSet', () => {
  it('builds a propagatable element set with metadata', () => {
    const set = ommToElementSet(EROS_LIKE_OMM);
    expect(set.noradId).toBe(99999);
    expect(set.name).toBe('EROS-LIKE (TEST)');
    expect(set.intlDesignator).toBe('2022-179A');
    expect(set.epoch.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(set.inclinationDeg).toBeCloseTo(97.4, 5);
    expect(set.meanMotion).toBeCloseTo(15.24, 5);
    expect(set.satrec.error).toBe(0);
  });

  it('reads the epoch back from the satrec to within a millisecond', () => {
    const set = ommToElementSet(EROS_LIKE_OMM);
    expect(Math.abs(satrecEpochDate(set.satrec).getTime() - set.epoch.getTime())).toBeLessThan(2);
  });

  it('computes the element-set age in days', () => {
    const set = ommToElementSet(EROS_LIKE_OMM);
    expect(elementSetAgeDays(set, new Date('2026-09-08T12:00:00Z'))).toBeCloseTo(7.5, 6);
    expect(elementSetAgeDays(set, new Date('2026-08-31T00:00:00Z'))).toBeCloseTo(-1, 6);
  });
});

describe('tleToElementSet', () => {
  // Synthetic two-line set matching the OMM fixture (columns per the TLE standard; checksums unused).
  const line1 = '1 99999U 22179A   26244.00000000  .00001000  00000-0  10000-3 0  9990';
  const line2 = '2 99999  97.4000 200.0000 0012000  90.0000 270.0000 15.24000000200000';

  it('parses the classic format and expands the international designator', () => {
    const set = tleToElementSet(line1, line2, 'EROS-LIKE');
    expect(set.noradId).toBe(99999);
    expect(set.name).toBe('EROS-LIKE');
    expect(set.intlDesignator).toBe('2022-179A');
    expect(set.inclinationDeg).toBeCloseTo(97.4, 3);
    expect(set.meanMotion).toBeCloseTo(15.24, 3);
    expect(set.epoch.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('agrees with the OMM form of the same elements', () => {
    const fromTle = tleToElementSet(line1, line2);
    const fromOmm = ommToElementSet(EROS_LIKE_OMM);
    expect(fromTle.satrec.no).toBeCloseTo(fromOmm.satrec.no, 8);
    expect(fromTle.satrec.inclo).toBeCloseTo(fromOmm.satrec.inclo, 8);
    expect(fromTle.satrec.nodeo).toBeCloseTo(fromOmm.satrec.nodeo, 8);
  });
});
