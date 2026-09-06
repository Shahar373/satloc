import { eciToEcf, geodeticToEcf, jday, shadowFraction, sunPos, type EciVec3 } from 'satellite.js';
import { EARTH_MEAN_RADIUS_M } from '../geometry/footprint';
import type { LatLon } from '../geometry/geodesy';

export type Vec3 = { x: number; y: number; z: number };

export interface TargetPoint extends LatLon {
  /** Kilometres above the ellipsoid. */
  heightKm: number;
}

const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const vec = { norm, dot, sub, scale, cross };

/** Earth-fixed position of a ground point, km. */
export function targetEcfKm(target: TargetPoint): Vec3 {
  const ecf = geodeticToEcf({ longitude: target.longitude, latitude: target.latitude, height: target.heightKm });
  return { x: ecf.x, y: ecf.y, z: ecf.z };
}

/**
 * Angle at the satellite between the nadir direction and the line of sight to `targetEcf`
 * (radians). 0 = straight below. Geocentric nadir; the difference from geodetic nadir is < 0.2 deg.
 */
export function offNadirAngle(satEcfKm: Vec3, targetEcfKm: Vec3): number {
  const nadir = scale(satEcfKm, -1 / norm(satEcfKm));
  const los = sub(targetEcfKm, satEcfKm);
  const c = dot(nadir, los) / norm(los);
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

/** Earth-central angle between two Earth-fixed position vectors, radians. */
export function centralAngle(a: Vec3, b: Vec3): number {
  const c = dot(a, b) / (norm(a) * norm(b));
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

/**
 * Which side of the ground track the target lies on, seen from the satellite looking along its
 * velocity: +1 = right, -1 = left, 0 = on track.
 */
export function targetSide(satEcfKm: Vec3, velocityEcfKmS: Vec3, targetEcfKm: Vec3): number {
  const nadir = scale(satEcfKm, -1 / norm(satEcfKm));
  const right = cross(nadir, velocityEcfKmS); // down x forward = right-hand side (right-hand rule)
  const s = dot(right, sub(targetEcfKm, satEcfKm));
  return s > 0 ? 1 : s < 0 ? -1 : 0;
}

/**
 * Earth central angle reachable with an off-nadir angle `eta` from altitude `altitudeM`:
 * law of sines in the triangle Earth-centre / satellite / ground point. Falls back to the
 * horizon when `eta` points past the limb.
 */
export function reachCentralAngle(altitudeM: number, eta: number, earthRadiusM = EARTH_MEAN_RADIUS_M): number {
  const ratio = ((earthRadiusM + altitudeM) / earthRadiusM) * Math.sin(eta);
  if (ratio >= 1) return Math.acos(earthRadiusM / (earthRadiusM + altitudeM));
  return Math.asin(ratio) - eta;
}

/** Unit vector towards the Sun in the Earth-fixed frame at `date`. */
export function sunDirectionEcf(date: Date, gmst: number): Vec3 {
  const { rsun } = sunPos(jday(date));
  const ecf = eciToEcf(rsun as EciVec3<number>, gmst);
  const n = norm(ecf);
  return { x: ecf.x / n, y: ecf.y / n, z: ecf.z / n };
}

/** Sun elevation above the local horizon of `target`, radians. */
export function sunElevationAt(target: LatLon, sunEcf: Vec3): number {
  const up: Vec3 = {
    x: Math.cos(target.latitude) * Math.cos(target.longitude),
    y: Math.cos(target.latitude) * Math.sin(target.longitude),
    z: Math.sin(target.latitude),
  };
  return Math.asin(Math.min(1, Math.max(-1, dot(up, sunEcf))));
}

/** True when the satellite sees at least part of the Sun (not in umbra). */
export function satelliteSunlit(satelliteTemeKm: Vec3, date: Date): boolean {
  const { rsun } = sunPos(jday(date));
  return shadowFraction(rsun, satelliteTemeKm) < 1;
}
