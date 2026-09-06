import type { SatRec } from 'satellite.js';
import { gmstAt, propagateTeme, temeToEcf, temeToGroundPoint } from '../propagation/sgp4';
import { EARTH_MEAN_RADIUS_M } from '../geometry/footprint';
import {
  centralAngle,
  offNadirAngle,
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
  /** The window continues past the end of the forecast (end is the forecast edge). */
  continuesAfterEnd: boolean;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Conservative upper bound on the ground speed of a low-orbit satellite, km/s. */
const GROUND_SPEED_KM_S = 8;

/**
 * Imaging opportunities of a satellite over a ground target between `start` and `start + days`.
 * Coarse scan of the "gap to access" (roll needed minus the roll limit), local minima refined by
 * golden-section search, window edges by bisection, then lighting at the closest approach.
 * Throws (PropagationError) when the satellite cannot be propagated at `start`, e.g. after decay.
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
  const earthKm = EARTH_MEAN_RADIUS_M / 1000;

  // Gap to access, radians: negative inside the roll limit. Inside the horizon it is the true
  // off-nadir angle minus the limit, so the reported roll never exceeds the limit. Beyond the
  // horizon the line of sight would pass through the Earth; there the gap is positive by construction.
  const gapAt = (ms: number): number => {
    const date = new Date(ms);
    const satEcf = temeToEcf(propagateTeme(satrec, date).position, gmstAt(date));
    const horizon = Math.acos(Math.min(1, earthKm / vec.norm(satEcf)));
    const lambda = centralAngle(satEcf, targetEcf);
    if (lambda >= horizon) return lambda - horizon + maxEta;
    return offNadirAngle(satEcf, targetEcf) - maxEta;
  };

  // Coarse samples. A window shorter than one step (small roll limits) need not contain a sample,
  // but it always leaves a local minimum of the gap within one step's worth of off-nadir change of
  // zero: the line of sight to a target near nadir swings at most atan(ground motion / altitude).
  const firstState = temeToEcf(propagateTeme(satrec, start).position, gmstAt(start));
  const altitudeKm = Math.max(150, vec.norm(firstState) - earthKm);
  const marginRad = Math.atan((GROUND_SPEED_KM_S * (stepMs / 1000)) / (0.6 * altitudeKm));
  const times: number[] = [];
  const gaps: number[] = [];
  for (let ms = startMs; ms <= endMs; ms += stepMs) {
    let gap: number;
    try {
      gap = gapAt(ms);
    } catch (err) {
      if (times.length === 0) throw err; // cannot propagate at all: the caller reports why
      break; // decays inside the window: keep what was found so far
    }
    times.push(ms);
    gaps.push(gap);
  }

  const opportunities: ImagingOpportunity[] = [];
  const n = gaps.length;
  let i = 0;
  while (i < n) {
    const g = gaps[i]!;
    const isMin = g <= marginRad && (i === 0 || g <= gaps[i - 1]!) && (i === n - 1 || g <= gaps[i + 1]!);
    if (!isMin) {
      i++;
      continue;
    }
    const lo = times[Math.max(0, i - 1)]!;
    const hi = times[Math.min(n - 1, i + 1)]!;
    const bestMs = lo === hi ? lo : goldenMinimum(lo, hi, gapAt);
    if (gapAt(bestMs) > 0) {
      i++;
      continue;
    }
    // Contiguous run of samples inside the limit around the minimum (empty when the window is
    // shorter than a step); the edges are then bisected against the first samples outside.
    let j = i;
    let k = i;
    const sampledInside = g <= 0;
    if (sampledInside) {
      while (j > 0 && gaps[j - 1]! <= 0) j--;
      while (k < n - 1 && gaps[k + 1]! <= 0) k++;
    }
    const outsideBefore = sampledInside ? (j > 0 ? times[j - 1]! : null) : i > 0 ? times[i - 1]! : null;
    const outsideAfter = sampledInside ? (k < n - 1 ? times[k + 1]! : null) : i < n - 1 ? times[i + 1]! : null;
    const insideStart = sampledInside ? times[j]! : bestMs;
    const insideEnd = sampledInside ? times[k]! : bestMs;
    const windowStart = outsideBefore === null ? startMs : bisect(outsideBefore, insideStart, 0, gapAt, true);
    const windowEnd = outsideAfter === null ? times[n - 1]! : bisect(insideEnd, outsideAfter, 0, gapAt, false);
    opportunities.push(
      buildOpportunity(satrec, target, targetEcf, windowStart, windowEnd, bestMs, minSun, outsideAfter === null),
    );
    i = Math.max(k, i) + 1;
  }
  return opportunities;
}

/** Golden-section search for the minimum of `f` on [lo, hi] (ms), to 0.5 s. */
function goldenMinimum(lo: number, hi: number, f: (ms: number) => number): number {
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = f(c);
  let fd = f(d);
  while (hi - lo > 500) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - phi * (hi - lo);
      fc = f(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + phi * (hi - lo);
      fd = f(d);
    }
  }
  return (lo + hi) / 2;
}

/** Threshold crossing between aMs and bMs; `entering` = outside->inside. 1 s tolerance. */
function bisect(aMs: number, bMs: number, limit: number, gapAt: (ms: number) => number, entering: boolean): number {
  let lo = aMs;
  let hi = bMs;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    const inside = gapAt(mid) <= limit;
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
  bestMs: number,
  minSun: number,
  continuesAfterEnd: boolean,
): ImagingOpportunity {
  const date = new Date(bestMs);
  const gmst = gmstAt(date);
  const state = propagateTeme(satrec, date);
  const satEcf = temeToEcf(state.position, gmst);
  const velEcf = temeToEcf(state.velocity, gmst); // rotation only; the Earth-rotation term does not change the side
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
    continuesAfterEnd,
  };
}
