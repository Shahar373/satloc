import { describe, expect, it } from 'vitest';
import { EROS_LIKE_OMM } from '../tle/fixtures';
import { ommToElementSet } from '../tle/omm';
import {
  gmstAt,
  orbitalPeriodMinutes,
  propagateTeme,
  sampleGroundTrack,
  sampleOrbitTeme,
  speedKmS,
  temeToEcf,
  temeToGroundPoint,
  temeVelocityToEcf,
} from './sgp4';

const EARTH_RADIUS_KM = 6371;
const norm = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
const deg = (rad: number) => (rad * 180) / Math.PI;

describe('propagateTeme', () => {
  const set = ommToElementSet(EROS_LIKE_OMM);

  it('places a 15.24 rev/day satellite about 500 km up, moving at ~7.6 km/s', () => {
    const state = propagateTeme(set.satrec, set.epoch);
    const altitude = norm(state.position) - EARTH_RADIUS_KM;
    expect(altitude).toBeGreaterThan(470);
    expect(altitude).toBeLessThan(540);
    expect(speedKmS(state)).toBeGreaterThan(7.5);
    expect(speedKmS(state)).toBeLessThan(7.7);
  });

  it('has a period of about 94.5 minutes and nearly closes after one revolution', () => {
    const period = orbitalPeriodMinutes(set.satrec);
    expect(period).toBeCloseTo(1440 / 15.24, 3);
    const a = propagateTeme(set.satrec, set.epoch).position;
    const b = propagateTeme(set.satrec, new Date(set.epoch.getTime() + period * 60_000)).position;
    // Nodal precession and drag move the orbit slightly within one revolution.
    expect(norm({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })).toBeLessThan(120);
  });

  it('always samples the anchor instant, so past and future halves of a track meet', () => {
    const from = new Date(set.epoch.getTime() + 1234);
    const track = sampleGroundTrack(set.satrec, from, 47.3, 94.7, 20);
    expect(track.some((s) => s.time.getTime() === from.getTime())).toBe(true);
    expect(track[0]!.time.getTime()).toBeLessThanOrEqual(from.getTime() - 47.3 * 60_000);
    expect(track[track.length - 1]!.time.getTime()).toBeGreaterThanOrEqual(from.getTime() + 94.7 * 60_000);
  });

  it('keeps the sub-satellite latitude within the inclination band', () => {
    const track = sampleGroundTrack(set.satrec, set.epoch, 0, 100, 30);
    expect(track.length).toBeGreaterThan(150);
    for (const { point } of track) {
      // Geodetic latitude can exceed the geocentric inclination band by up to ~0.2 deg.
      expect(Math.abs(deg(point.latitude))).toBeLessThanOrEqual(180 - 97.4 + 0.3);
      expect(point.heightKm).toBeGreaterThan(470);
      expect(point.heightKm).toBeLessThan(540);
    }
    const maxLat = Math.max(...track.map((s) => Math.abs(deg(s.point.latitude))));
    expect(maxLat).toBeGreaterThan(80);
  });

  it('samples a closed orbit loop in TEME', () => {
    const loop = sampleOrbitTeme(set.satrec, set.epoch, 90);
    expect(loop).toHaveLength(91);
    const first = loop[0]!;
    const last = loop[loop.length - 1]!;
    expect(norm({ x: first.x - last.x, y: first.y - last.y, z: first.z - last.z })).toBeLessThan(120);
  });
});

describe('frame conversion', () => {
  it('rotates TEME into the fixed frame without changing the radius', () => {
    const set = ommToElementSet(EROS_LIKE_OMM);
    const t = new Date('2026-09-02T06:30:00Z');
    const state = propagateTeme(set.satrec, t);
    const gmst = gmstAt(t);
    const ecf = temeToEcf(state.position, gmst);
    expect(norm(ecf)).toBeCloseTo(norm(state.position), 6);
    const ground = temeToGroundPoint(state.position, gmst);
    expect(ground.heightKm).toBeCloseTo(norm(state.position) - EARTH_RADIUS_KM, -2);
    expect(Math.abs(ground.longitude)).toBeLessThanOrEqual(Math.PI);
  });

  it('a geostationary satellite is nearly at rest in the Earth-fixed frame', () => {
    const geo = ommToElementSet({
      ...EROS_LIKE_OMM,
      OBJECT_NAME: 'GEO (TEST)',
      NORAD_CAT_ID: 99998,
      MEAN_MOTION: 1.0027,
      INCLINATION: 0.05,
      ECCENTRICITY: 0.0002,
      BSTAR: 0,
      MEAN_MOTION_DOT: 0,
    });
    const t = new Date('2026-09-03T00:00:00Z');
    const state = propagateTeme(geo.satrec, t);
    const v = temeVelocityToEcf(state, gmstAt(t));
    expect(norm(v)).toBeLessThan(0.02);
    // The LEO fixture keeps most of its 7.6 km/s: the rotating frame changes it by well under 10%.
    const leo = ommToElementSet(EROS_LIKE_OMM);
    const leoState = propagateTeme(leo.satrec, t);
    expect(norm(temeVelocityToEcf(leoState, gmstAt(t)))).toBeGreaterThan(7.0);
  });

  it('GMST advances ~360.99 degrees per day', () => {
    const t0 = new Date('2026-09-01T00:00:00Z');
    const t1 = new Date('2026-09-02T00:00:00Z');
    let delta = deg(gmstAt(t1) - gmstAt(t0));
    delta = ((delta % 360) + 360) % 360;
    expect(delta).toBeCloseTo(0.9856, 2);
  });
});

/**
 * Independent reference validation for gmstAt() — see docs/models/gmst.md. Re-implements the
 * IAU 1982 GMST formula from Meeus, Astronomical Algorithms 2nd ed., eq 12.4, from scratch
 * (a from-scratch Julian Date conversion plus the published polynomial), rather than reusing
 * satellite.js's own gstime() source. gstime() implements the algebraically equivalent Vallado
 * eq 3-45 (verified by inspection: its constant term 67310.54841s / 240 = 280.460618375deg,
 * matching Meeus's constant exactly).
 */
function toJulianDate(date: Date): number {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate();
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;
  const a = Math.floor((14 - M) / 12);
  const y = Y + 4800 - a;
  const m = M + 12 * a - 3;
  const jdn =
    D + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  return jdn + (hour - 12) / 24;
}

function gmstReferenceDeg(date: Date): number {
  const jd = toJulianDate(date);
  const dUT = jd - 2451545.0;
  const T = dUT / 36525;
  const deg = 280.46061837 + 360.98564736629 * dUT + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((deg % 360) + 360) % 360;
}

describe('GMST independent reference (docs/models/gmst.md)', () => {
  it("matches the IAU 1982 formula's zero point at J2000.0 exactly, with no arithmetic on our side", () => {
    const j2000 = new Date('2000-01-01T12:00:00Z');
    expect(toJulianDate(j2000)).toBeCloseTo(2451545.0, 9);
    const expectedDeg = 280.46061837508; // the formula's own constant term at T = 0
    expect(gmstAt(j2000)).toBeCloseTo(deg2rad(expectedDeg), 6);
  });

  it('agrees with an independently-coded implementation of the same published formula', () => {
    const dates = [
      new Date('2000-01-01T12:00:00Z'),
      new Date('2020-06-15T08:30:00Z'),
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-01T06:00:00Z'),
      new Date('2026-12-31T23:59:59Z'),
    ];
    for (const d of dates) {
      expect(gmstAt(d)).toBeCloseTo(deg2rad(gmstReferenceDeg(d)), 6);
    }
  });
});

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}
