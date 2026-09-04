import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  circlePoints,
  destinationPoint,
  initialBearing,
  stripEdges,
  wrapLongitude,
} from './geodesy';

const deg = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

describe('destinationPoint / initialBearing', () => {
  it('moves due north along a meridian', () => {
    const p = destinationPoint({ latitude: deg(31.5), longitude: deg(35) }, 0, deg(1));
    expect(toDeg(p.latitude)).toBeCloseTo(32.5, 6);
    expect(toDeg(p.longitude)).toBeCloseTo(35, 6);
  });

  it('is consistent with the bearing back to the start', () => {
    const start = { latitude: deg(31.5), longitude: deg(35) };
    const p = destinationPoint(start, deg(45), deg(5));
    expect(toDeg(angularDistance(start, p))).toBeCloseTo(5, 6);
    const back = toDeg(initialBearing(p, start));
    expect(((back + 360) % 360) - 225).toBeLessThan(3); // ~225 deg, slightly different on a sphere
  });

  it('wraps longitudes across the antimeridian', () => {
    const p = destinationPoint({ latitude: 0, longitude: deg(179) }, deg(90), deg(2));
    expect(toDeg(p.longitude)).toBeCloseTo(-179, 5);
    expect(toDeg(wrapLongitude(deg(190)))).toBeCloseTo(-170, 9);
    expect(toDeg(wrapLongitude(deg(-190)))).toBeCloseTo(170, 9);
  });
});

describe('circlePoints', () => {
  it('produces a closed ring at the requested angular radius', () => {
    const center = { latitude: deg(-7), longitude: deg(8.7) };
    const ring = circlePoints(center, deg(22), 36);
    expect(ring).toHaveLength(37);
    for (const p of ring) expect(toDeg(angularDistance(center, p))).toBeCloseTo(22, 6);
    expect(ring[0]!.latitude).toBeCloseTo(ring[36]!.latitude, 9);
    expect(ring[0]!.longitude).toBeCloseTo(ring[36]!.longitude, 9);
  });

  it('handles a circle around the pole', () => {
    const ring = circlePoints({ latitude: deg(89.9), longitude: 0 }, deg(5), 12);
    for (const p of ring) expect(toDeg(p.latitude)).toBeGreaterThan(84);
  });
});

describe('stripEdges', () => {
  it('offsets a northbound path to the west (left) and east (right)', () => {
    const path = [0, 1, 2, 3].map((lat) => ({ latitude: deg(lat), longitude: deg(35) }));
    const { left, right } = stripEdges(path, deg(0.2));
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);
    for (let i = 0; i < path.length; i++) {
      expect(toDeg(left[i]!.longitude)).toBeCloseTo(34.9, 3);
      expect(toDeg(right[i]!.longitude)).toBeCloseTo(35.1, 3);
      expect(toDeg(left[i]!.latitude)).toBeCloseTo(i, 3);
    }
  });

  it('returns empty edges for fewer than two samples', () => {
    expect(stripEdges([{ latitude: 0, longitude: 0 }], deg(1))).toEqual({ left: [], right: [] });
  });
});
