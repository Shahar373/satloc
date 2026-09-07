# Operator-simulation design (Phase C)

This is the committed reference for the design decisions Phase C's PRs have been implementing
against — `src/contracts/`, `SimulationClock`, `ForecastService`, `EventLog`/`Scheduler`, session
persistence, and the `Asteria-1` scenario. It exists because several of those PRs' descriptions
cited "the plan, §3/§5" without that plan ever having been committed to the repository — this file
corrects that: it is the actual source of truth going forward, not a session-local note.

## Event envelope and streams

One canonical record shape for every event, across three streams, in one append-only log
(`SessionFile.records`, `src/contracts/envelope.ts`):

```ts
interface EventEnvelope<T> {
  recordId: string; // ULID: unique and roughly time-ordered, even across sessions
  globalSequence: number; // 1..n, contiguous, no gaps, within one session — the canonical order
  recordedAt: string; // wall-clock ISO-8601 timestamp of when this record was appended
  simTime: string; // simulation-time ISO-8601 timestamp at the moment of recording
  stream: 'domain' | 'operator' | 'run-control';
  event: T;
  causedBy?: { recordId: string; globalSequence: number }; // always points backward
}
```

- **Canonical order** is `globalSequence`. `records[]` is the only thing stored; `domain`/
  `operator`/`run-control` projections are always computed by filtering, never stored separately
  (`domainRecords`/`operatorRecords`/`runControlRecords` in `envelope.ts`).
- **Invariants** (`validateSessionRecords`, enforced live by `EventLog.append()`, not just checked
  later): `globalSequence` is contiguous; `causedBy.globalSequence` is strictly backward and points
  at a record that actually exists; `simTime` never decreases between consecutive **domain**
  records (non-domain streams may go backward — that's what a seek looks like).
- **Versioning**: `event.type` is versioned (`'CommandAccepted@1'`), so a future schema change adds
  `'CommandAccepted@2'` alongside it rather than breaking old session files.

## Simulation clock

`SimulationClock` (`src/core/clock/SimulationClock.ts`, see `docs/adr/0002-simulation-clock.md`)
is a pure, dependency-free clock advanced only by explicit calls — never by reading the wall clock
itself. When a Cesium viewer is attached, it stays authoritative (this project's existing rule:
simulation time comes from `viewer.clock.currentTime`); `ClockAdapter` mirrors it into a
`SimulationClock` one-directionally rather than letting two clocks drift apart.

## Scheduler

`Scheduler` (`src/core/log/Scheduler.ts`) is deliberately a skeleton: `schedule(simTime, event)`
queues a `DomainEvent`, `advanceTo(simTime)` fires everything now due by appending to the
`EventLog`. No domain logic (task progression, command validation, storage accounting) lives here
— that is the Plan workspace's and Train console's job, in PRs that build on this.

## Truth State vs Operator Observables

Two distinct views of a running scenario, kept structurally separate rather than one object with
some fields flagged "hidden":

- **Truth State** (`src/core/truth/TruthState.ts`) is what actually happened, folded
  deterministically from the `DomainEvent` stream: task status, command status, data products
  currently stored onboard, storage used, and active ground contacts. Pure — `applyDomainEvent`/
  `foldTruthState` take state and events in, return new state out, nothing else.
- **Operator Observables** is what the operator can currently _see_ — which may lag Truth State
  (a contact not yet confirmed on the ground-station link), omit parts of it (storage internals
  the operator's console doesn't expose), or add operator-only annotations (a waived warning).
  Not implemented yet; a later Plan/Train PR derives it from Truth State plus what the operator's
  instruments would realistically report.

The split matters because a Debrief view needs to show both — what really happened, and what the
operator actually knew at each moment — side by side, and conflating them would make that
comparison impossible.

`TruthState` only tracks what `src/contracts/events.ts`'s current `DomainEvent` set actually
conveys. In particular there is no `TaskCreated`/`TaskPlanned` event yet, so a task only appears in
`taskStatus` once `TaskStarted`/`TaskCompleted` has actually fired for it — a future PR that adds
task-creation as its own event should extend the reducer, not have it guess a task into existence
from nothing. Storage accounting assumes a downlinked product is removed from onboard storage
(freeing its space), since there is no `DataProductDeleted` event to model an explicit, separate
deletion step in this version.

## Satellite storage/downlink model

All GB fields are decimal (10⁹ bytes); the UI may offer GiB as a display-only conversion.
`SatelliteProfile.units: 'GB-decimal'` records this explicitly.

```
usableGB              = rawGB − reservedGB
maxProducts(mode)      = floor(usableGB / productGB(mode))
downlinkGB(contact)     = rateMbps × max(0, durationS − acquisitionS) / 8000
```

`checkProfileConsistency` (`src/contracts/domain.ts`) enforces: `reservedGB < rawGB`; every
`productGB(mode) ≤ usableGB`; `maxProducts(mode) ≥ 1`. It deliberately does **not** check downlink
capacity against a scenario's shortest planned contact — that needs a contact list, which is a
scenario-level concern (`checkScenarioConsistency`, `src/contracts/scenario.ts`), not a
profile-only one.

## Asteria-1

A wholly fictional satellite (`src/contracts/asteria1.ts`) invented for the training slice — none
of its values are derived from, or should be mistaken for, ImageSat International's real
satellites. Every value's `Provenance` (`assumed`, `simulated`, or `calculated` — never
`public-fact`) is recorded per field, and `ASTERIA_1_SCENARIO.disclaimer` is meant to be shown
wherever this data appears in the UI.

| Parameter                          | Value                                                                                                                                                                            | Provenance | Note                                                                                                                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw storage                        | 8 GB                                                                                                                                                                             | assumed    |                                                                                                                                                                                                               |
| Reserved (housekeeping/telemetry)  | 2 GB                                                                                                                                                                             | assumed    |                                                                                                                                                                                                               |
| Usable storage                     | 6 GB                                                                                                                                                                             | calculated |                                                                                                                                                                                                               |
| PAN product (10 km strip)          | 1.2 GB                                                                                                                                                                           | simulated  |                                                                                                                                                                                                               |
| MS product (10 km strip)           | 0.4 GB                                                                                                                                                                           | simulated  |                                                                                                                                                                                                               |
| Max PAN products                   | 5                                                                                                                                                                                | calculated | 6/1.2 — tight enough that "downlink before you run out of storage" is a real decision, not a formality                                                                                                        |
| Downlink rate                      | 150 Mbps                                                                                                                                                                         | assumed    |                                                                                                                                                                                                               |
| Acquisition                        | 20 s                                                                                                                                                                             | assumed    |                                                                                                                                                                                                               |
| Downlink per 8-min contact         | 8.625 GB                                                                                                                                                                         | calculated | enough to clear the full 6 GB budget; a 4-min contact clears 4.125 GB — not quite enough for 4 PAN products, which is what makes the choice interesting                                                       |
| Max roll                           | 30°                                                                                                                                                                              | assumed    |                                                                                                                                                                                                               |
| Slew rate                          | 0.5°/s                                                                                                                                                                           | assumed    |                                                                                                                                                                                                               |
| Settling                           | 15 s                                                                                                                                                                             | assumed    |                                                                                                                                                                                                               |
| Sun elevation constraint (default) | 20°                                                                                                                                                                              | assumed    |                                                                                                                                                                                                               |
| Uplink                             | 64 kbps                                                                                                                                                                          | assumed    |                                                                                                                                                                                                               |
| Ground stations                    | GS-Home (31.5°N 35°E, min el. 10°), GS-North (60°N 35°E, min el. 5°) — both fictional                                                                                            | simulated  | two stations, geometrically distinct per orbit, so passes aren't all identical                                                                                                                                |
| Orbit                              | Synthetic TLE, NORAD 90001 (a reserved/unassigned catalog number, chosen so it can never collide with a real object), sun-synchronous ~500 km altitude, near-circular ("frozen") | simulated  | inclination 97.4°, eccentricity 0.0001, mean motion ≈ 15.24 rev/day (period ≈ 94.4 min); validated against `src/core/tle/omm.ts`'s own checksum/SGP4-init logic in `asteria1.test.ts`, not hand-verified only |

## Scenario definition

`ScenarioDefinition` (`src/contracts/scenario.ts`) bundles a satellite profile, its synthetic TLE,
ground stations, and a simulation start time into one loadable unit. `checkScenarioConsistency`
composes `checkProfileConsistency` with scenario-level checks (at least one ground station, no
duplicate station ids, a well-formed `startTime`) — a scenario that fails this should be treated as
a hard load-time error, per the Plan workspace's `HardBlock` severity.

## What's not decided here

Session persistence's schema-validation approach (hand-rolled shape checks today, `zod` proposed
but not approved), the Plan workspace's full `ValidationFinding` model, Train console telemetry
channels, and Scenario 02's fault injection are all still open — later PRs, not this document.
