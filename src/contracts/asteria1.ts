import type { GroundStation, Provenance, SatelliteProfile } from './domain';
import type { ScenarioDefinition } from './scenario';

/**
 * Asteria-1: a wholly fictional satellite invented for the operator-simulation training slice.
 * Every numeric value here is either `assumed` (a reasonable design choice, not measured),
 * `simulated` (computed by our own model, not observed), or `calculated` (derived from other
 * fields in this same table) — never `public-fact`. None of it is derived from, or should be
 * mistaken for, ImageSat International's real satellites; the UI must always show this
 * provenance so nothing simulated is read as real telemetry.
 *
 * Values match the operator-simulation plan's worked storage example exactly (6 GB usable /
 * 1.2 GB per PAN product = 5 max products; an 8-minute contact clears 8.625 GB) — see
 * docs/design/operator-simulation.md, chosen specifically because that budget is tight enough to
 * make "downlink before you run out of storage" an interesting decision, unlike a roomier profile
 * that would fit dozens of images with no real constraint.
 */
export const ASTERIA_1_PROFILE: SatelliteProfile = {
  id: 'asteria-1',
  name: 'Asteria-1',
  units: 'GB-decimal',
  storage: {
    rawGB: 8,
    reservedGB: 2,
    productGB: { PAN: 1.2, MS: 0.4 },
  },
  downlink: {
    rateMbps: 150,
    acquisitionS: 20,
  },
  imaging: {
    maxRollDeg: 30,
    slewRateDegPerS: 0.5,
    settlingS: 15,
    sunElevationConstraintDeg: 20,
  },
  uplinkKbps: 64,
  provenance: {
    'storage.rawGB': 'assumed',
    'storage.reservedGB': 'assumed',
    'storage.productGB': 'simulated',
    'downlink.rateMbps': 'assumed',
    'downlink.acquisitionS': 'assumed',
    'imaging.maxRollDeg': 'assumed',
    'imaging.slewRateDegPerS': 'assumed',
    'imaging.settlingS': 'assumed',
    'imaging.sunElevationConstraintDeg': 'assumed',
    uplinkKbps: 'assumed',
  } satisfies Record<string, Provenance>,
};

/**
 * A synthetic two-line element set — NOT a real object (NORAD catalog numbers in the 90000s are
 * reserved/unassigned in practice, chosen deliberately so this can never collide with, or be
 * mistaken for, a real satellite's TLE). Sun-synchronous, ~500 km altitude, near-circular
 * ("frozen") orbit: inclination 97.4°, eccentricity 0.0001, mean motion ~15.24 rev/day (period
 * ~94.4 min) — typical figures for a small EO satellite at this altitude, chosen for
 * plausibility, not fitted to any real mission. Line format and checksums verified against
 * src/core/tle/omm.ts's own validateTleLine/tleToElementSet in asteria1.test.ts.
 */
export const ASTERIA_1_TLE = {
  name: 'ASTERIA-1 (SYNTHETIC)',
  line1: '1 90001U 26900A   26250.00000000  .00000000  00000-0  00000-0 0  9992',
  line2: '2 90001  97.4000   0.0000 0001000  90.0000 270.0000 15.24000000000014',
} as const;

/**
 * Two fictional ground stations (docs/design/operator-simulation.md's plan, §5): GS-Home near
 * Tel Aviv (a plausible operator location for an Israel-focused training scenario) and GS-North
 * at high latitude (gives a second, geometrically distinct contact opportunity per orbit —
 * without it, every pass would look the same, which makes for a boring scenario).
 */
export const ASTERIA_1_GROUND_STATIONS: GroundStation[] = [
  { id: 'gs-home', name: 'GS-Home', latitudeDeg: 31.5, longitudeDeg: 35, minElevationDeg: 10 },
  { id: 'gs-north', name: 'GS-North', latitudeDeg: 60, longitudeDeg: 35, minElevationDeg: 5 },
];

/**
 * The complete Scenario 01 definition (the plan's happy-path training scenario), starting
 * exactly at the synthetic TLE's own epoch — so a run begins with no SGP4 extrapolation drift
 * already baked in.
 */
export const ASTERIA_1_SCENARIO: ScenarioDefinition = {
  id: 'asteria-1-scenario-01',
  name: 'Asteria-1 — Scenario 01',
  disclaimer:
    'Asteria-1 is a fictional satellite invented for training. Its orbit, storage/downlink figures, and ground stations are simulated or assumed, not real telemetry from any ImageSat International satellite.',
  satellite: ASTERIA_1_PROFILE,
  tle: ASTERIA_1_TLE,
  groundStations: ASTERIA_1_GROUND_STATIONS,
  startTime: '2026-09-07T00:00:00.000Z',
};
