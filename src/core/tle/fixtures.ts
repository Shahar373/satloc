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
