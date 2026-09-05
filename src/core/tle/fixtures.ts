import type { OmmRecord } from './omm';

/**
 * Synthetic but physically consistent element set for tests: a ~500 km sun-synchronous orbit
 * like EROS-C3 (mean motion 15.24 rev/day, inclination 97.4 deg). Not real tracking data.
 */
export const EROS_LIKE_OMM: OmmRecord = {
  OBJECT_NAME: 'EROS-LIKE (TEST)',
  OBJECT_ID: '2022-179A',
  EPOCH: '2026-09-01T00:00:00.000000',
  MEAN_MOTION: 15.24,
  ECCENTRICITY: 0.0012,
  INCLINATION: 97.4,
  RA_OF_ASC_NODE: 200.0,
  ARG_OF_PERICENTER: 90.0,
  MEAN_ANOMALY: 270.0,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 99999,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 20000,
  BSTAR: 0.0001,
  MEAN_MOTION_DOT: 0.00001,
  MEAN_MOTION_DDOT: 0,
};

/**
 * Synthetic constellation for tests and demos: `count` satellites spread over several orbital
 * shells and planes, names FIX-000... Deterministic, no randomness.
 */
export function syntheticConstellation(count: number): OmmRecord[] {
  const shells = [
    { meanMotion: 15.5, inclination: 53.0 }, // ~430 km, Starlink-like
    { meanMotion: 14.9, inclination: 97.6 }, // ~600 km, sun-synchronous
    { meanMotion: 12.8, inclination: 87.9 }, // ~1200 km, OneWeb-like
    { meanMotion: 2.0, inclination: 55.0 }, // ~20000 km, GNSS-like
  ];
  const records: OmmRecord[] = [];
  for (let i = 0; i < count; i++) {
    const shell = shells[i % shells.length]!;
    const plane = Math.floor(i / shells.length) % 12;
    records.push({
      ...EROS_LIKE_OMM,
      OBJECT_NAME: `FIX-${i.toString().padStart(3, '0')}`,
      OBJECT_ID: `2026-${(100 + (i % 800)).toString().padStart(3, '0')}A`,
      NORAD_CAT_ID: 90000 + i,
      MEAN_MOTION: shell.meanMotion,
      INCLINATION: shell.inclination,
      RA_OF_ASC_NODE: (plane * 30 + (i % 7) * 2) % 360,
      MEAN_ANOMALY: ((i * 137.5) % 360),
      ARG_OF_PERICENTER: (i * 53) % 360,
      ECCENTRICITY: 0.0005,
      BSTAR: 0.00001,
      MEAN_MOTION_DOT: 0,
    });
  }
  return records;
}
