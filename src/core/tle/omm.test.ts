import { describe, expect, it } from 'vitest';
import { EROS_LIKE_OMM } from './fixtures';
import { elementSetAgeDays, ommToElementSet, satrecEpochDate, tleToElementSet, tleChecksum, validateTleLine } from './omm';

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

  it('rejects malformed element sets instead of producing NaN positions', () => {
    expect(() => ommToElementSet({ ...EROS_LIKE_OMM, MEAN_MOTION: Number.NaN })).toThrow(/malformed/);
    expect(() => ommToElementSet({ ...EROS_LIKE_OMM, INCLINATION: undefined as unknown as number })).toThrow(/malformed/);
    expect(() => ommToElementSet({ ...EROS_LIKE_OMM, ECCENTRICITY: 1.2 })).toThrow();
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
  const line1 = '1 99999U 22179A   26244.00000000  .00001000  00000-0  10000-3 0  9999';
  const line2 = '2 99999  97.4000 200.0000 0012000  90.0000 270.0000 15.24000000200004';

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

describe('TLE line validation', () => {
  const line1 = '1 99999U 22179A   26244.00000000  .00001000  00000-0  10000-3 0  9999';
  const line2 = '2 99999  97.4000 200.0000 0012000  90.0000 270.0000 15.24000000200004';
  it('accepts lines with a correct checksum', () => {
    expect(() => validateTleLine(line1, 1)).not.toThrow();
    expect(() => validateTleLine(line2, 2)).not.toThrow();
    expect(tleChecksum(line1)).toBe(Number(line1[68]));
  });
  it('rejects a corrupted digit, a wrong length and a wrong line number', () => {
    const corrupted = line1.slice(0, 20) + '9' + line1.slice(21);
    expect(() => validateTleLine(corrupted, 1)).toThrow(/checksum/);
    expect(() => validateTleLine(line1.slice(0, 60), 1)).toThrow(/69/);
    expect(() => validateTleLine(line2, 1)).toThrow(/starts with/);
    expect(() => tleToElementSet(corrupted, line2)).toThrow(/checksum/);
  });
});
