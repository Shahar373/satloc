import { ecfToLookAngles, type SatRec } from 'satellite.js';
import { gmstAt, propagateTeme, temeToEcf } from '../propagation/sgp4';

export interface Observer {
  /** Radians. */
  latitude: number;
  /** Radians. */
  longitude: number;
  /** Kilometres above the ellipsoid. */
  heightKm: number;
}

export interface LookAngles {
  /** Radians, clockwise from north. */
  azimuth: number;
  /** Radians above the horizon. */
  elevation: number;
  rangeKm: number;
}

export interface Pass {
  /** Acquisition of signal: the satellite rises above the minimum elevation. */
  aos: Date;
  /** Time of closest approach (maximum elevation). */
  tca: Date;
  /** Loss of signal. */
  los: Date;
  maxElevationDeg: number;
  aosAzimuthDeg: number;
  tcaAzimuthDeg: number;
  losAzimuthDeg: number;
  durationS: number;
  /** True when the satellite was already above the threshold at the start of the search window. */
  inProgressAtStart: boolean;
  /** True when the pass continues past the end of the search window (LOS is the window edge). */
  continuesAfterEnd: boolean;
}

export interface PredictOptions {
  /** Passes below this peak elevation are ignored and AOS/LOS are where the satellite crosses it. Degrees. */
  minElevationDeg?: number;
  /** Coarse search step, seconds. LEO passes last minutes, so 30 s cannot miss one. */
  coarseStepS?: number;
  /** Bisection tolerance for AOS/LOS, seconds. */
  toleranceS?: number;
}

const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function lookAnglesAt(satrec: SatRec, observer: Observer, date: Date): LookAngles {
  const state = propagateTeme(satrec, date);
  const ecf = temeToEcf(state.position, gmstAt(date));
  const look = ecfToLookAngles(
    { latitude: observer.latitude, longitude: observer.longitude, height: observer.heightKm },
    ecf,
  );
  return { azimuth: look.azimuth, elevation: look.elevation, rangeKm: look.rangeSat };
}

/**
 * Passes of a satellite over an observer between `start` and `start + hours`.
 * Coarse scan for threshold crossings, bisection to refine AOS/LOS, golden-section search for TCA.
 */
export function predictPasses(
  satrec: SatRec,
  observer: Observer,
  start: Date,
  hours = 48,
  options: PredictOptions = {},
): Pass[] {
  const minEl = ((options.minElevationDeg ?? 10) * Math.PI) / 180;
  const stepMs = (options.coarseStepS ?? 30) * 1000;
  const tolMs = (options.toleranceS ?? 1) * 1000;
  const startMs = start.getTime();
  const endMs = startMs + hours * 3_600_000;

  const elevationAt = (ms: number) => lookAnglesAt(satrec, observer, new Date(ms)).elevation;
  const passes: Pass[] = [];

  let prevMs = startMs;
  // A failure here (decayed or malformed elements) is the caller's to report; do not hide it as "no passes".
  let prevEl = elevationAt(prevMs);
  let aosMs: number | null = prevEl >= minEl ? startMs : null;
  let inProgress = prevEl >= minEl;
  let decayed = false;

  for (let ms = startMs + stepMs; ms <= endMs; ms += stepMs) {
    let el: number;
    try {
      el = elevationAt(ms);
    } catch {
      decayed = true;
      break; // the satellite decays inside the window: stop scanning, keep what was found
    }
    if (aosMs === null && prevEl < minEl && el >= minEl) {
      aosMs = bisect(prevMs, ms, minEl, elevationAt, tolMs, true);
      inProgress = false;
    } else if (aosMs !== null && prevEl >= minEl && el < minEl) {
      const losMs = bisect(prevMs, ms, minEl, elevationAt, tolMs, false);
      passes.push(buildPass(satrec, observer, aosMs, losMs, elevationAt, inProgress, false));
      aosMs = null;
    }
    prevMs = ms;
    prevEl = el;
  }
  // A pass still in progress at the end of the window is reported, truncated at the window edge
  // (one cut short by decay is truncated too, but does not continue anywhere).
  if (aosMs !== null && prevMs > aosMs) {
    passes.push(buildPass(satrec, observer, aosMs, Math.min(prevMs, endMs), elevationAt, inProgress, !decayed));
  }

  return passes;
}

/** Find the threshold crossing between `aMs` and `bMs` (rising: below->above, else above->below). */
function bisect(
  aMs: number,
  bMs: number,
  threshold: number,
  elevationAt: (ms: number) => number,
  tolMs: number,
  rising: boolean,
): number {
  let lo = aMs;
  let hi = bMs;
  while (hi - lo > tolMs) {
    const mid = (lo + hi) / 2;
    const above = elevationAt(mid) >= threshold;
    if (above === rising) hi = mid;
    else lo = mid;
  }
  return rising ? hi : lo;
}

function buildPass(
  satrec: SatRec,
  observer: Observer,
  aosMs: number,
  losMs: number,
  elevationAt: (ms: number) => number,
  inProgressAtStart: boolean,
  continuesAfterEnd: boolean,
): Pass {
  // Golden-section search for the elevation maximum (unimodal within a single pass).
  const phi = (Math.sqrt(5) - 1) / 2;
  let lo = aosMs;
  let hi = losMs;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let fc = elevationAt(c);
  let fd = elevationAt(d);
  while (hi - lo > 500) {
    if (fc > fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - phi * (hi - lo);
      fc = elevationAt(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + phi * (hi - lo);
      fd = elevationAt(d);
    }
  }
  const tcaMs = (lo + hi) / 2;
  const aosLook = lookAnglesAt(satrec, observer, new Date(aosMs));
  const tcaLook = lookAnglesAt(satrec, observer, new Date(tcaMs));
  const losLook = lookAnglesAt(satrec, observer, new Date(losMs));
  return {
    aos: new Date(aosMs),
    tca: new Date(tcaMs),
    los: new Date(losMs),
    maxElevationDeg: toDeg(tcaLook.elevation),
    aosAzimuthDeg: (toDeg(aosLook.azimuth) + 360) % 360,
    tcaAzimuthDeg: (toDeg(tcaLook.azimuth) + 360) % 360,
    losAzimuthDeg: (toDeg(losLook.azimuth) + 360) % 360,
    durationS: (losMs - aosMs) / 1000,
    inProgressAtStart,
    continuesAfterEnd,
  };
}

/** Compass point for an azimuth in degrees, e.g. 'NNE'. */
export function compassPoint(azimuthDeg: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16]!;
}
