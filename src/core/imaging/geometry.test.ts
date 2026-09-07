import { describe, expect, it } from 'vitest';
import { sunDirectionEcf, sunElevationAt } from './geometry';
import { gmstAt } from '../propagation/sgp4';
import type { LatLon } from '../geometry/geodesy';

const deg2rad = (d: number) => (d * Math.PI) / 180;
const rad2deg = (r: number) => (r * 180) / Math.PI;

// Same from-scratch Julian Date conversion used and cross-checked in sgp4.test.ts
// (docs/models/gmst.md) — duplicated here so this file stays self-contained and auditable
// on its own, without importing test-only helpers across files.
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

function gmstReferenceRad(date: Date): number {
  const jd = toJulianDate(date);
  const dUT = jd - 2451545.0;
  const T = dUT / 36525;
  const g = 280.46061837 + 360.98564736629 * dUT + 0.000387933 * T * T - (T * T * T) / 38710000;
  return deg2rad(((g % 360) + 360) % 360);
}

/**
 * Meeus, Astronomical Algorithms 2nd ed., ch. 25, low-precision solar coordinates
 * (accuracy ~0.01deg, 1950-2050) — see docs/models/sun-elevation.md. Independently coded
 * from satellite.js's sunPos() (Vallado's low-precision ephemeris): different mean-longitude
 * and mean-anomaly coefficients, a 3-term equation of center vs. Vallado's 2-term, and an
 * apparent-longitude/obliquity nutation correction Vallado's version omits.
 */
function sunApparentRaDecMeeus(date: Date): { ra: number; dec: number } {
  const T = (toJulianDate(date) - 2451545.0) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T; // mean longitude, deg
  const M = deg2rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T); // mean anomaly
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M); // equation of center, deg
  const trueLong = L0 + C;
  const omega = deg2rad(125.04 - 1934.136 * T);
  const apparentLong = deg2rad(trueLong - 0.00569 - 0.00478 * Math.sin(omega));
  const eps0 = 23.439291 - 0.0130042 * T;
  const eps = deg2rad(eps0 + 0.00256 * Math.cos(omega));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(apparentLong), Math.cos(apparentLong));
  const dec = Math.asin(Math.sin(eps) * Math.sin(apparentLong));
  return { ra, dec };
}

/** Elevation via the standard spherical-trig formula, independent of sunElevationAt()'s ECEF path. */
function elevationFromRaDec(site: LatLon, date: Date, ra: number, dec: number): number {
  const gmst = gmstReferenceRad(date);
  const H = gmst + site.longitude - ra;
  return Math.asin(Math.sin(site.latitude) * Math.sin(dec) + Math.cos(site.latitude) * Math.cos(dec) * Math.cos(H));
}

describe('sun elevation independent reference (docs/models/sun-elevation.md)', () => {
  const sites: Array<{ name: string; site: LatLon }> = [
    { name: 'GS-Home (31.5N 35E)', site: { latitude: deg2rad(31.5), longitude: deg2rad(35) } },
    { name: 'GS-North (60N 0E)', site: { latitude: deg2rad(60), longitude: 0 } },
    { name: 'equator/date line', site: { latitude: 0, longitude: deg2rad(179) } },
  ];
  const dates = [
    new Date('2026-03-20T09:00:00Z'), // near equinox
    new Date('2026-06-21T12:00:00Z'), // near solstice
    new Date('2026-09-01T15:30:00Z'),
    new Date('2026-12-21T00:00:00Z'),
  ];

  for (const { name, site } of sites) {
    for (const date of dates) {
      it(`agrees with Meeus low-precision solar position within 0.5deg (${name}, ${date.toISOString()})`, () => {
        const { ra, dec } = sunApparentRaDecMeeus(date);
        const referenceElevationDeg = rad2deg(elevationFromRaDec(site, date, ra, dec));

        const gmst = gmstAt(date);
        const sunEcf = sunDirectionEcf(date, gmst);
        const actualElevationDeg = rad2deg(sunElevationAt(site, sunEcf));

        expect(actualElevationDeg).toBeCloseTo(referenceElevationDeg, 0); // within 0.5deg (toBeCloseTo digit 0 => diff < 0.5)
      });
    }
  }
});
