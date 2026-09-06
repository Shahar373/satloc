import { describe, expect, it } from 'vitest';
import { EROS_LIKE_OMM } from '../tle/fixtures';
import { ommToElementSet } from '../tle/omm';
import { compassPoint, lookAnglesAt, predictPasses, type Observer } from './predict';

const deg = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

const TEL_AVIV: Observer = { latitude: deg(32.0853), longitude: deg(34.7818), heightKm: 0.03 };

describe('predictPasses', () => {
  const { satrec, epoch } = ommToElementSet(EROS_LIKE_OMM);

  it('finds well-formed, non-overlapping passes over 48 hours', () => {
    const passes = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 10 });
    // A ~500 km sun-synchronous orbit passes a mid-latitude site a few times a day.
    expect(passes.length).toBeGreaterThanOrEqual(2);
    expect(passes.length).toBeLessThanOrEqual(12);

    for (let i = 0; i < passes.length; i++) {
      const p = passes[i]!;
      expect(p.aos.getTime()).toBeLessThan(p.tca.getTime());
      expect(p.tca.getTime()).toBeLessThan(p.los.getTime());
      expect(p.durationS).toBeGreaterThan(30);
      expect(p.durationS).toBeLessThan(15 * 60);
      expect(p.maxElevationDeg).toBeGreaterThanOrEqual(10);
      expect(p.maxElevationDeg).toBeLessThanOrEqual(90);

      // AOS/LOS sit on the threshold to within the 1 s tolerance.
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, p.aos).elevation)).toBeGreaterThanOrEqual(10 - 0.05);
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, new Date(p.aos.getTime() - 2000)).elevation)).toBeLessThan(10);
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, p.los).elevation)).toBeGreaterThanOrEqual(10 - 0.05);
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, new Date(p.los.getTime() + 2000)).elevation)).toBeLessThan(10);

      // TCA is the maximum: neighbours are lower.
      const tcaEl = toDeg(lookAnglesAt(satrec, TEL_AVIV, p.tca).elevation);
      expect(tcaEl).toBeCloseTo(p.maxElevationDeg, 6);
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, new Date(p.tca.getTime() - 20_000)).elevation)).toBeLessThanOrEqual(tcaEl + 1e-6);
      expect(toDeg(lookAnglesAt(satrec, TEL_AVIV, new Date(p.tca.getTime() + 20_000)).elevation)).toBeLessThanOrEqual(tcaEl + 1e-6);

      if (i > 0) expect(p.aos.getTime()).toBeGreaterThan(passes[i - 1]!.los.getTime());
    }
  });

  it('reports more passes at a lower elevation threshold', () => {
    const high = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 30 });
    const low = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 0 });
    expect(low.length).toBeGreaterThanOrEqual(high.length);
    for (const p of low) expect(p.durationS).toBeGreaterThan(60);
  });

  it('marks a pass already in progress at the start of the window', () => {
    const first = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 10 })[0]!;
    const midPass = new Date((first.aos.getTime() + first.los.getTime()) / 2);
    const passes = predictPasses(satrec, TEL_AVIV, midPass, 6, { minElevationDeg: 10 });
    expect(passes[0]!.inProgressAtStart).toBe(true);
    expect(passes[0]!.aos.getTime()).toBe(midPass.getTime());
    expect(Math.abs(passes[0]!.los.getTime() - first.los.getTime())).toBeLessThan(2000);
  });

  it('keeps a pass that is still in progress at the end of the window', () => {
    const first = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 10 })[0]!;
    const hours = (first.tca.getTime() - epoch.getTime()) / 3_600_000;
    const passes = predictPasses(satrec, TEL_AVIV, epoch, hours, { minElevationDeg: 10 });
    const last = passes[passes.length - 1]!;
    expect(last.continuesAfterEnd).toBe(true);
    expect(Math.abs(last.los.getTime() - (epoch.getTime() + hours * 3_600_000))).toBeLessThan(35_000);
    expect(passes.slice(0, -1).every((p) => !p.continuesAfterEnd)).toBe(true);
  });

  it('throws for a satellite that cannot be propagated instead of reporting no passes', () => {
    const decayed = ommToElementSet({ ...EROS_LIKE_OMM, EPOCH: '2000-01-01T00:00:00.000000', BSTAR: 0.5 });
    expect(() => predictPasses(decayed.satrec, TEL_AVIV, new Date('2026-09-01T00:00:00Z'), 1)).toThrow();
  });

  it('returns nothing for a window with no passes', () => {
    const first = predictPasses(satrec, TEL_AVIV, epoch, 48, { minElevationDeg: 10 })[0]!;
    // A window that ends before the first AOS.
    const hours = (first.aos.getTime() - epoch.getTime() - 120_000) / 3_600_000;
    if (hours > 0.1) {
      expect(predictPasses(satrec, TEL_AVIV, epoch, hours, { minElevationDeg: 10 })).toHaveLength(0);
    }
  });
});

describe('compassPoint', () => {
  it('maps azimuths to 16-point compass names', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(11)).toBe('N');
    expect(compassPoint(12)).toBe('NNE');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(-45)).toBe('NW');
  });
});
