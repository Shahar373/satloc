import {
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  type EciVec3,
  type SatRec,
} from 'satellite.js';

/** Position (km) and velocity (km/s) in the TEME inertial frame. */
export interface TemeState {
  position: EciVec3<number>;
  velocity: EciVec3<number>;
}

export interface GroundPoint {
  /** Radians. */
  latitude: number;
  /** Radians, -PI..PI. */
  longitude: number;
  /** Kilometres above the WGS84 ellipsoid. */
  heightKm: number;
}

export class PropagationError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'PropagationError';
  }
}

const SGP4_ERRORS: Record<number, string> = {
  1: 'mean elements: eccentricity out of range or mean motion <= 0',
  2: 'mean motion less than 0',
  3: 'perturbed eccentricity out of range',
  4: 'semi-latus rectum < 0',
  5: 'epoch elements are sub-orbital',
  6: 'satellite has decayed',
};

/**
 * SGP4 at `date`. Throws PropagationError when the model cannot produce a state, including the
 * satellite.js decay check that catches objects SGP4 would otherwise place at garbage positions.
 */
export function propagateTeme(satrec: SatRec, date: Date): TemeState {
  const result = propagate(satrec, date, { communityDecayCheckEnabled: true });
  if (!result || typeof result.position !== 'object' || typeof result.velocity !== 'object') {
    const code = satrec.error;
    throw new PropagationError(code, SGP4_ERRORS[code] ?? `SGP4 error ${code}`);
  }
  return { position: result.position, velocity: result.velocity };
}

/** Greenwich mean sidereal time for `date`, radians. */
export function gmstAt(date: Date): number {
  return gstime(date);
}

/** TEME -> Earth-fixed (ECEF) position in km. Pass the GMST of the instant the TEME vector refers to. */
export function temeToEcf(position: EciVec3<number>, gmst: number): EciVec3<number> {
  const ecf = eciToEcf(position, gmst);
  return { x: ecf.x, y: ecf.y, z: ecf.z };
}

/** Sub-satellite point (geodetic) for a TEME position at a given GMST. */
export function temeToGroundPoint(position: EciVec3<number>, gmst: number): GroundPoint {
  const geo = eciToGeodetic(position, gmst);
  return { latitude: geo.latitude, longitude: geo.longitude, heightKm: geo.height };
}

/** Orbital period from the published (Kozai) mean motion, in minutes. */
export function orbitalPeriodMinutes(satrec: SatRec): number {
  const radPerMin = satrec.nokozai;
  return (2 * Math.PI) / radPerMin;
}

/** Speed in km/s. */
export function speedKmS(state: TemeState): number {
  const { x, y, z } = state.velocity;
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Samples one full orbit in TEME, starting at `from`. `steps` points, the last one
 * closing the loop at exactly one period. Used for the orbit path, which stays fixed
 * in inertial space while the Earth rotates underneath.
 */
export function sampleOrbitTeme(satrec: SatRec, from: Date, steps = 180): EciVec3<number>[] {
  const periodMs = orbitalPeriodMinutes(satrec) * 60_000;
  const points: EciVec3<number>[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = new Date(from.getTime() + (periodMs * i) / steps);
    points.push(propagateTeme(satrec, t).position);
  }
  return points;
}

/**
 * Ground track: sub-satellite points from `from - before` to `from + after` (both durations in
 * minutes), stepping `stepSeconds`. Each point uses the GMST of its own instant, so the track is
 * the true path over the rotating Earth.
 */
export function sampleGroundTrack(
  satrec: SatRec,
  from: Date,
  beforeMinutes: number,
  afterMinutes: number,
  stepSeconds = 10,
): { time: Date; point: GroundPoint }[] {
  const start = from.getTime() - beforeMinutes * 60_000;
  const end = from.getTime() + afterMinutes * 60_000;
  const out: { time: Date; point: GroundPoint }[] = [];
  for (let t = start; t <= end; t += stepSeconds * 1000) {
    const time = new Date(t);
    const state = propagateTeme(satrec, time);
    out.push({ time, point: temeToGroundPoint(state.position, gmstAt(time)) });
  }
  return out;
}
