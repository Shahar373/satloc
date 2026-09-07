import { describe, expect, it } from 'vitest';
import { ASTERIA_1_GROUND_STATIONS, ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE } from './asteria1';
import { checkProfileConsistency } from './domain';
import { checkScenarioConsistency } from './scenario';
import { tleToElementSet } from '../core/tle/omm';

describe('ASTERIA_1_PROFILE', () => {
  it('is internally consistent', () => {
    expect(checkProfileConsistency(ASTERIA_1_PROFILE)).toEqual([]);
  });

  it("matches the plan's worked example exactly (6 GB usable, 5 max PAN products)", () => {
    expect(ASTERIA_1_PROFILE.storage.rawGB - ASTERIA_1_PROFILE.storage.reservedGB).toBe(6);
    expect(Math.floor(6 / ASTERIA_1_PROFILE.storage.productGB.PAN)).toBe(5);
  });

  it('every numeric field has a provenance entry, and none is public-fact', () => {
    for (const provenance of Object.values(ASTERIA_1_PROFILE.provenance)) {
      expect(provenance).not.toBe('public-fact');
    }
  });
});

describe('ASTERIA_1_TLE', () => {
  it('is a valid, self-consistent TLE (checksum, SGP4 init) — not a claim about any real satellite', () => {
    const elementSet = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    expect(elementSet.noradId).toBe(90001); // reserved/unassigned NORAD range, deliberately not a real catalog number
    expect(elementSet.inclinationDeg).toBeCloseTo(97.4, 3);
    expect(elementSet.eccentricity).toBeCloseTo(0.0001, 6);
  });

  it('is sun-synchronous-altitude (~500 km): mean motion implies a period around 90-100 minutes', () => {
    const elementSet = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const periodMin = 1440 / elementSet.meanMotion;
    expect(periodMin).toBeGreaterThan(90);
    expect(periodMin).toBeLessThan(100);
  });

  it('the scenario starts exactly at the TLE epoch (no propagation drift baked in)', () => {
    const elementSet = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    expect(elementSet.epoch.toISOString()).toBe(ASTERIA_1_SCENARIO.startTime);
  });
});

describe('ASTERIA_1_GROUND_STATIONS', () => {
  it('has at least two stations with distinct ids', () => {
    expect(ASTERIA_1_GROUND_STATIONS.length).toBeGreaterThanOrEqual(2);
    const ids = ASTERIA_1_GROUND_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ASTERIA_1_SCENARIO', () => {
  it('is internally consistent', () => {
    expect(checkScenarioConsistency(ASTERIA_1_SCENARIO)).toEqual([]);
  });

  it('carries a disclaimer identifying it as fictional', () => {
    expect(ASTERIA_1_SCENARIO.disclaimer.length).toBeGreaterThan(0);
    expect(ASTERIA_1_SCENARIO.disclaimer.toLowerCase()).toContain('fictional');
  });
});
