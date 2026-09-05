import type { SatRec } from 'satellite.js';
import { gmstAt, propagateTeme, temeToEcf, temeToGroundPoint } from '../propagation/sgp4';
import { EARTH_MEAN_RADIUS_M } from '../geometry/footprint';
import {
  centralAngle,
  offNadirAngle,
  reachCentralAngle,
  satelliteSunlit,
  sunDirectionEcf,
  sunElevationAt,
  targetEcfKm,
  targetSide,
  type TargetPoint,
  type Vec3,
  vec,
} from './geometry';

export interface ImagingOptions {
  /** Largest body roll the satellite can use to look sideways, degrees. */
  maxOffNadirDeg?: number;
  /** Optical imaging needs daylight on the ground: minimum Sun elevation at the target, degrees. */
  minSunElevationDeg?: number;
  /** Coarse scan step, seconds. Access windows last minutes, so 20 s cannot miss one. */
  coarseStepS?: number;
}

export interface ImagingOpportunity {
  /** Instant of smallest off-nadir angle (closest approach). */
  time: Date;
  /** Access window: off-nadir angle within the limit. */
  start: Date;
  end: Date;
  offNadirDeg: number;
  sunElevationDeg: number;
  satelliteSunlit: boolean;
  /** Satellite moving north (ascending) or south (descending) at closest approach. */
  direction: 'ascending' | 'descending';
  /** Target lies left or right of the ground track. */
  side: 'left' | 'right';
  /** Sun high enough for an optical image. */
  daylight: boolean;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Imaging opportunities of a satellite over a ground target between `start` and `start + days`:
 * coarse scan of the off-nadir angle, bisection on the window edges, golden-section search for
 * the closest approach, then lighting at that instant.
 */
export function findImagingOpportunities(
  satrec: SatRec,
  target: TargetPoint,
  start: Date,
  days = 7,
  options: ImagingOptions = {},
): ImagingOpportunity[] {
  const maxEta = toRad(options.maxOffNadirDeg ?? 45);
  const minSun = toRad(options.minSunElevationDeg ?? 15);
  const stepMs = (options.coarseStepS ?? 20) * 1000;
  const startMs = start.getTime();
  const endMs = startMs + days * 86_400_000;
  const targetEcf = targetEcfKm(target);

  // Access is decided on the Earth-central angle between the sub-satellite point and the target,
  // compared with the reach of the roll limit at the current altitude. Unlike the raw off-nadir
  // angle this cannot be fooled by a target on the far side of the planet (whose line of sight
  // would pass through the Earth). Positive = outside the reach, negative = inside.
  const etaAt = (ms: number): number => {
    const date = new Date(ms);
    const state = propagateTeme(satrec, date);
    const satEcf = temeToEcf(state.position, gmstAt(date));
    const altitudeM = (vec.norm(satEcf) - EARTH_MEAN_RADIUS_M / 1000) * 1000;
    return centralAngle(satEcf, targetEcf) - reachCentralAngle(altitudeM, maxEta);
  };

  const opportunities: ImagingOpportunity[] = [];
  let prevMs = startMs;
  let prevEta: number;
  try {
    prevEta = etaAt(prevMs);
  } catch {
    return opportunities;
  }
  let windowStart: number | null = prevEta <= 0 ? startMs : null;

  for (let ms = startMs + stepMs; ms <= endMs + stepMs; ms += stepMs) {
    let eta: number;
    try {
      eta = etaAt(ms);
    } catch {
      break;
    }
    if (windowStart === null && prevEta > 0 && eta <= 0) {
      windowStart = bisect(prevMs, ms, 0, etaAt, true);
    } else if (windowStart !== null && prevEta <= 0 && eta > 0) {
      const windowEnd = bisect(prevMs, ms, 0, etaAt, false);
      opportunities.push(buildOpportunity(satrec, target, targetEcf, windowStart, windowEnd, etaAt, minSun));
      windowStart = null;
    }
    prevMs = ms;
    prevEta = eta;
  }
  return opportunities;
}

/** Threshold crossing between aMs and bMs; `entering` = above->below the limit. 1 s tolerance. */
function bisect(aMs: number, bMs: number, limit: number, etaAt: (ms: number) => number, entering: boolean): number {
  let lo = aMs;
  let hi = bMs;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    const inside = etaAt(mid) <= limit;
    if (inside === entering) hi = mid;
    else lo = mid;
  }
  return entering ? hi : lo;
}

function buildOpportunity(
  satrec: SatRec,
  target: TargetPoint,
  targetEcf: Vec3,
  startMs: number,
  endMs: number,
  etaAt: (ms: number) => number,
  minSun: number,
): ImagingOpportunity {
  // Golden-section search for the minimum off-nadir angle (unimodal within one window).
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = startMs;
  let hi = endMs;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = etaAt(c);
  let fd = etaAt(d);
  while (hi - lo > 500) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - phi * (hi - lo);
      fc = etaAt(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + phi * (hi - lo);
      fd = etaAt(d);
    }
  }
  const bestMs = (lo + hi) / 2;
  const date = new Date(bestMs);
  const gmst = gmstAt(date);
  const state = propagateTeme(satrec, date);
  const satEcf = temeToEcf(state.position, gmst);
  const velEcf = temeToEcf(state.velocity, gmst); // rotation only; Earth-rotation term is irrelevant for the side test
  const later = temeToGroundPoint(propagateTeme(satrec, new Date(bestMs + 1000)).position, gmstAt(new Date(bestMs + 1000)));
  const now = temeToGroundPoint(state.position, gmst);
  const sunEcf = sunDirectionEcf(date, gmst);
  const sunElevation = sunElevationAt(target, sunEcf);

  return {
    time: date,
    start: new Date(startMs),
    end: new Date(endMs),
    offNadirDeg: toDeg(offNadirAngle(satEcf, targetEcf)),
    sunElevationDeg: toDeg(sunElevation),
    satelliteSunlit: satelliteSunlit(state.position, date),
    direction: later.latitude >= now.latitude ? 'ascending' : 'descending',
    side: targetSide(satEcf, velEcf, targetEcf) >= 0 ? 'right' : 'left',
    daylight: sunElevation >= minSun,
  };
}
