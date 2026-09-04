import { describe, expect, it } from 'vitest';
import { footprintCentralAngle, footprintRadiusM } from './footprint';

const deg = (d: number) => (d * Math.PI) / 180;

describe('footprintRadiusM', () => {
  it('matches the horizon footprint of a ~500 km LEO satellite (EROS class)', () => {
    const radiusKm = footprintRadiusM(500_000) / 1000;
    expect(radiusKm).toBeGreaterThan(2_430);
    expect(radiusKm).toBeLessThan(2_460);
  });

  it('matches the horizon footprint of a geostationary satellite', () => {
    const radiusKm = footprintRadiusM(35_786_000) / 1000;
    expect(radiusKm).toBeGreaterThan(9_000);
    expect(radiusKm).toBeLessThan(9_080);
    // Just over 81 degrees of central angle
    expect(footprintCentralAngle(35_786_000)).toBeCloseTo(deg(81.3), 1);
  });

  it('shrinks as the minimum elevation rises', () => {
    const at0 = footprintRadiusM(500_000, deg(0));
    const at10 = footprintRadiusM(500_000, deg(10));
    const at45 = footprintRadiusM(500_000, deg(45));
    expect(at10).toBeLessThan(at0);
    expect(at45).toBeLessThan(at10);
  });

  it('is zero straight overhead and for non-positive altitudes', () => {
    expect(footprintRadiusM(500_000, deg(90))).toBe(0);
    expect(footprintRadiusM(0)).toBe(0);
    expect(footprintRadiusM(-10)).toBe(0);
    expect(footprintRadiusM(Number.NaN)).toBe(0);
  });
});
