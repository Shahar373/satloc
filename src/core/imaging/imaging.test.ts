import { describe, expect, it } from 'vitest';
import { EARTH_MEAN_RADIUS_M } from '../geometry/footprint';
import { gmstAt, propagateTeme, temeToEcf, temeToGroundPoint } from '../propagation/sgp4';
import { EROS_LIKE_OMM } from '../tle/fixtures';
import { ommToElementSet } from '../tle/omm';
import { offNadirAngle, reachCentralAngle, sunDirectionEcf, sunElevationAt, targetEcfKm, targetSide } from './geometry';
import { findImagingOpportunities } from './opportunities';

const deg = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
const TEL_AVIV = { latitude: deg(32.0853), longitude: deg(34.7818), heightKm: 0.03 };

describe('imaging geometry', () => {
  it('off-nadir is zero straight below the satellite and grows sideways', () => {
    const { satrec, epoch } = ommToElementSet(EROS_LIKE_OMM);
    const state = propagateTeme(satrec, epoch);
    const gmst = gmstAt(epoch);
    const sat = temeToEcf(state.position, gmst);
    const below = temeToGroundPoint(state.position, gmst);
    const nadirTarget = targetEcfKm({ latitude: below.latitude, longitude: below.longitude, heightKm: 0 });
    expect(toDeg(offNadirAngle(sat, nadirTarget))).toBeLessThan(0.3);

    // 5 degrees of latitude away (~556 km) from 500 km up: roughly 45 degrees off-nadir.
    const aside = targetEcfKm({ latitude: below.latitude + deg(5), longitude: below.longitude, heightKm: 0 });
    const eta = toDeg(offNadirAngle(sat, aside));
    expect(eta).toBeGreaterThan(40);
    expect(eta).toBeLessThan(50);
  });

  it('targetSide: facing east on the equator, a target to the south is on the right', () => {
    const sat = { x: 6371 + 536, y: 0, z: 0 }; // over 0N 0E
    const eastward = { x: 0, y: 7.6, z: 0 };
    const south = targetEcfKm({ latitude: deg(-5), longitude: 0, heightKm: 0 });
    const north = targetEcfKm({ latitude: deg(5), longitude: 0, heightKm: 0 });
    expect(targetSide(sat, eastward, south)).toBe(1);
    expect(targetSide(sat, eastward, north)).toBe(-1);
    // Flying west the sides swap.
    expect(targetSide(sat, { x: 0, y: -7.6, z: 0 }, south)).toBe(-1);
  });

  it('reach: 45 degrees from 536 km spans about 5 degrees of central angle', () => {
    const lambda = reachCentralAngle(536_000, deg(45));
    expect(toDeg(lambda)).toBeGreaterThan(4.8);
    expect(toDeg(lambda)).toBeLessThan(5.3);
    expect((lambda * EARTH_MEAN_RADIUS_M) / 1000).toBeGreaterThan(530);
    // Beyond the limb it clamps to the horizon footprint.
    expect(reachCentralAngle(536_000, deg(89))).toBeCloseTo(Math.acos(6371008.8 / 6907008.8), 6);
  });

  it('sun elevation: noon in Tel Aviv on 1 September is high, midnight is far below the horizon', () => {
    const noon = new Date('2026-09-01T09:40:00Z'); // ~solar noon at 34.8 E
    const midnight = new Date('2026-09-01T21:40:00Z');
    const elNoon = toDeg(sunElevationAt(TEL_AVIV, sunDirectionEcf(noon, gmstAt(noon))));
    const elMidnight = toDeg(sunElevationAt(TEL_AVIV, sunDirectionEcf(midnight, gmstAt(midnight))));
    expect(elNoon).toBeGreaterThan(60);
    expect(elNoon).toBeLessThan(70);
    expect(elMidnight).toBeLessThan(-40);
  });
});

describe('findImagingOpportunities', () => {
  const { satrec, epoch } = ommToElementSet(EROS_LIKE_OMM);

  it('finds well-formed opportunities over Tel Aviv within a week', () => {
    const opps = findImagingOpportunities(satrec, TEL_AVIV, epoch, 7, { maxOffNadirDeg: 45, minSunElevationDeg: 15 });
    expect(opps.length).toBeGreaterThanOrEqual(5);
    expect(opps.length).toBeLessThanOrEqual(30);
    for (let i = 0; i < opps.length; i++) {
      const o = opps[i]!;
      expect(o.start.getTime()).toBeLessThan(o.time.getTime());
      expect(o.time.getTime()).toBeLessThan(o.end.getTime());
      expect(o.offNadirDeg).toBeGreaterThanOrEqual(0);
      expect(o.offNadirDeg).toBeLessThanOrEqual(45);
      expect(o.end.getTime() - o.start.getTime()).toBeLessThan(10 * 60_000);
      expect(Math.abs(o.sunElevationDeg)).toBeLessThanOrEqual(90);
      expect(o.daylight).toBe(o.sunElevationDeg >= 15);
      if (i > 0) expect(o.start.getTime()).toBeGreaterThan(opps[i - 1]!.end.getTime());
    }
    // A near sun-synchronous orbit with an afternoon node sees the site in daylight at least once a week.
    expect(opps.some((o) => o.daylight)).toBe(true);
    expect(opps.some((o) => !o.daylight)).toBe(true);
  });

  it('a tighter roll limit yields fewer or equal opportunities, all within the limit', () => {
    const wide = findImagingOpportunities(satrec, TEL_AVIV, epoch, 7, { maxOffNadirDeg: 45 });
    const narrow = findImagingOpportunities(satrec, TEL_AVIV, epoch, 7, { maxOffNadirDeg: 20 });
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
    for (const o of wide) expect(o.offNadirDeg).toBeLessThanOrEqual(45.001);
    for (const o of narrow) {
      expect(o.offNadirDeg).toBeLessThanOrEqual(20.001);
      // Every narrow window lies inside a wide one.
      expect(wide.some((w) => w.start.getTime() <= o.time.getTime() && o.time.getTime() <= w.end.getTime())).toBe(true);
    }
  });

  it('finds windows shorter than the coarse step at a small roll limit', () => {
    // At 5 degrees the reach is ~45 km, crossed in a few seconds; the 20 s scan must still catch it.
    const tiny = findImagingOpportunities(satrec, TEL_AVIV, epoch, 30, { maxOffNadirDeg: 5, coarseStepS: 20 });
    const fine = findImagingOpportunities(satrec, TEL_AVIV, epoch, 30, { maxOffNadirDeg: 5, coarseStepS: 2 });
    expect(tiny.length).toBe(fine.length);
    for (const o of tiny) {
      expect(o.offNadirDeg).toBeLessThanOrEqual(5.001);
      expect(o.end.getTime() - o.start.getTime()).toBeLessThan(60_000);
      expect(fine.some((f) => Math.abs(f.time.getTime() - o.time.getTime()) < 3000)).toBe(true);
    }
  });

  it('reports a window that continues past the end of the forecast', () => {
    const first = findImagingOpportunities(satrec, TEL_AVIV, epoch, 7)[0]!;
    const days = (first.time.getTime() - epoch.getTime()) / 86_400_000;
    const cut = findImagingOpportunities(satrec, TEL_AVIV, epoch, days);
    const last = cut[cut.length - 1]!;
    expect(last.continuesAfterEnd).toBe(true);
    expect(Math.abs(last.end.getTime() - (epoch.getTime() + days * 86_400_000))).toBeLessThan(25_000);
  });

  it('throws instead of returning an empty list when the satellite cannot be propagated', () => {
    const decayed = ommToElementSet({ ...EROS_LIKE_OMM, EPOCH: '2000-01-01T00:00:00.000000', BSTAR: 0.5 });
    expect(() => findImagingOpportunities(decayed.satrec, TEL_AVIV, new Date('2026-09-01T00:00:00Z'), 1)).toThrow();
  });
});
