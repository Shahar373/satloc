import { checkProfileConsistency, type GroundStation, type SatelliteProfile } from './domain';

export interface SyntheticTle {
  name: string;
  line1: string;
  line2: string;
}

/**
 * Everything needed to start a training run: which satellite, on what synthetic orbit, over which
 * ground stations, from what simulated moment. `disclaimer` is shown wherever this scenario's data
 * appears in the UI (docs/design/operator-simulation.md) — a scenario built on invented data must
 * never be mistakable for a real operational picture.
 */
export interface ScenarioDefinition {
  id: string;
  name: string;
  disclaimer: string;
  satellite: SatelliteProfile;
  tle: SyntheticTle;
  groundStations: GroundStation[];
  /** Simulation start time (ISO-8601) — the SimulationClock begins here (src/core/clock/SimulationClock.ts). */
  startTime: string;
}

/**
 * Checks the scenario-level invariants beyond `checkProfileConsistency` (which only looks at the
 * satellite profile in isolation): at least one ground station, no duplicate ground-station ids,
 * and a well-formed `startTime`. Returns violation descriptions; empty means the scenario is
 * internally consistent and safe to load.
 *
 * Deliberately does **not** check `tle`'s structural validity (checksum, SGP4 initialisation) —
 * that lives in `src/core/tle/omm.ts`'s `tleToElementSet`/`validateTleLine`, and `src/contracts`
 * must not depend on `src/core` (the reverse is the established direction throughout Phase C:
 * `SimulationClock`/`EventLog`/`SessionStore` all consume `src/contracts`, never the other way).
 * Whatever actually parses `scenario.tle` into a `SatRec` gets that validation for free already.
 */
export function checkScenarioConsistency(scenario: ScenarioDefinition): string[] {
  const violations = [...checkProfileConsistency(scenario.satellite)];

  if (scenario.groundStations.length === 0) {
    violations.push('scenario must define at least one ground station');
  }
  const seenIds = new Set<string>();
  for (const station of scenario.groundStations) {
    if (seenIds.has(station.id)) violations.push(`duplicate ground station id "${station.id}"`);
    seenIds.add(station.id);
  }

  if (Number.isNaN(new Date(scenario.startTime).getTime())) {
    violations.push(`startTime "${scenario.startTime}" is not a valid ISO-8601 date`);
  }

  return violations;
}
