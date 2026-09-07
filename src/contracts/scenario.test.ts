import { describe, expect, it } from 'vitest';
import { ASTERIA_1_GROUND_STATIONS, ASTERIA_1_PROFILE, ASTERIA_1_TLE } from './asteria1';
import { checkScenarioConsistency, type ScenarioDefinition } from './scenario';

function scenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    disclaimer: 'fictional',
    satellite: ASTERIA_1_PROFILE,
    tle: ASTERIA_1_TLE,
    groundStations: ASTERIA_1_GROUND_STATIONS,
    startTime: '2026-09-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('checkScenarioConsistency', () => {
  it('accepts a well-formed scenario', () => {
    expect(checkScenarioConsistency(scenario())).toEqual([]);
  });

  it('rejects a scenario with no ground stations', () => {
    const violations = checkScenarioConsistency(scenario({ groundStations: [] }));
    expect(violations.some((v) => v.includes('at least one ground station'))).toBe(true);
  });

  it('rejects duplicate ground station ids', () => {
    const violations = checkScenarioConsistency(
      scenario({ groundStations: [ASTERIA_1_GROUND_STATIONS[0]!, ASTERIA_1_GROUND_STATIONS[0]!] }),
    );
    expect(violations.some((v) => v.includes('duplicate ground station id'))).toBe(true);
  });

  it('rejects an invalid startTime', () => {
    const violations = checkScenarioConsistency(scenario({ startTime: 'not-a-date' }));
    expect(violations.some((v) => v.includes('not a valid ISO-8601 date'))).toBe(true);
  });

  it("surfaces the underlying satellite profile's own inconsistencies too", () => {
    const badProfile = { ...ASTERIA_1_PROFILE, storage: { ...ASTERIA_1_PROFILE.storage, reservedGB: 100 } };
    const violations = checkScenarioConsistency(scenario({ satellite: badProfile }));
    expect(violations.some((v) => v.includes('reservedGB'))).toBe(true);
  });
});
