/**
 * Ground footprint of a satellite: the circle on the Earth's surface from which the
 * satellite is seen above a given minimum elevation angle.
 *
 * Central angle: lambda = acos( R / (R + h) * cos(eps) ) - eps
 * Ground radius: d = R * lambda
 */

/** IUGG mean Earth radius, metres. */
export const EARTH_MEAN_RADIUS_M = 6_371_008.8;

export function footprintCentralAngle(
  altitudeM: number,
  minElevationRad = 0,
  earthRadiusM = EARTH_MEAN_RADIUS_M,
): number {
  if (!(altitudeM > 0)) return 0;
  const ratio = earthRadiusM / (earthRadiusM + altitudeM);
  const cosArg = Math.min(1, Math.max(-1, ratio * Math.cos(minElevationRad)));
  return Math.max(0, Math.acos(cosArg) - minElevationRad);
}

/** Radius of the footprint circle measured along the ground, metres. */
export function footprintRadiusM(
  altitudeM: number,
  minElevationRad = 0,
  earthRadiusM = EARTH_MEAN_RADIUS_M,
): number {
  return earthRadiusM * footprintCentralAngle(altitudeM, minElevationRad, earthRadiusM);
}
