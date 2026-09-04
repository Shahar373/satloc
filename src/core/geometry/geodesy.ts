/**
 * Spherical geodesy helpers (radians throughout). Accuracy on the WGS84 ellipsoid is within a
 * fraction of a percent over the distances we draw (footprints, swath edges), which is far below
 * the SGP4 position error itself.
 */

export interface LatLon {
  /** Radians. */
  latitude: number;
  /** Radians. */
  longitude: number;
}

const TWO_PI = 2 * Math.PI;

/** Wrap a longitude into -PI..PI. */
export function wrapLongitude(lon: number): number {
  let l = lon % TWO_PI;
  if (l > Math.PI) l -= TWO_PI;
  if (l < -Math.PI) l += TWO_PI;
  return l;
}

/**
 * Point reached by travelling `angularDistance` radians (distance / Earth radius) from `start`
 * along `bearing` (radians clockwise from north).
 */
export function destinationPoint(start: LatLon, bearing: number, angularDistance: number): LatLon {
  const sinLat = Math.sin(start.latitude);
  const cosLat = Math.cos(start.latitude);
  const sinD = Math.sin(angularDistance);
  const cosD = Math.cos(angularDistance);
  const lat = Math.asin(sinLat * cosD + cosLat * sinD * Math.cos(bearing));
  const lon =
    start.longitude + Math.atan2(Math.sin(bearing) * sinD * cosLat, cosD - sinLat * Math.sin(lat));
  return { latitude: lat, longitude: wrapLongitude(lon) };
}

/** Initial bearing from `from` towards `to`, radians clockwise from north. */
export function initialBearing(from: LatLon, to: LatLon): number {
  const dLon = to.longitude - from.longitude;
  const y = Math.sin(dLon) * Math.cos(to.latitude);
  const x =
    Math.cos(from.latitude) * Math.sin(to.latitude) -
    Math.sin(from.latitude) * Math.cos(to.latitude) * Math.cos(dLon);
  return Math.atan2(y, x);
}

/** Central angle between two points (haversine), radians. */
export function angularDistance(a: LatLon, b: LatLon): number {
  const dLat = b.latitude - a.latitude;
  const dLon = b.longitude - a.longitude;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude) * Math.cos(b.latitude) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `segments` points on the small circle of angular radius `angularRadius` around `center`, closed. */
export function circlePoints(center: LatLon, angularRadius: number, segments = 72): LatLon[] {
  const points: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    points.push(destinationPoint(center, (TWO_PI * i) / segments, angularRadius));
  }
  return points;
}

/**
 * Left and right edges of a strip of total angular width `angularWidth` centred on a path.
 * Each edge has one point per path sample; the bearing at a sample is taken towards the next
 * sample (or from the previous one for the last sample).
 */
export function stripEdges(path: LatLon[], angularWidth: number): { left: LatLon[]; right: LatLon[] } {
  const left: LatLon[] = [];
  const right: LatLon[] = [];
  if (path.length < 2) return { left, right };
  const half = angularWidth / 2;
  for (let i = 0; i < path.length; i++) {
    const here = path[i]!;
    const bearing =
      i < path.length - 1 ? initialBearing(here, path[i + 1]!) : initialBearing(path[i - 1]!, here);
    left.push(destinationPoint(here, bearing - Math.PI / 2, half));
    right.push(destinationPoint(here, bearing + Math.PI / 2, half));
  }
  return { left, right };
}
