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
  `computeOperatorObservables` (`src/core/observables/OperatorObservables.ts`) implements the
  first of these: a contact only appears in `confirmedContactIds` once
  `profile.downlink.acquisitionS` seconds of simulated time have passed since its
  `ContactAcquired@1` — the same real lock-on delay `downlinkGB` already subtracts from a
  contact's useful duration, reused rather than inventing a new assumed constant. It is not a
  fold like `TruthState`'s (state alone isn't enough — confirmation is relative to a point in
  time), so it takes `(records, profile, atSimTime)` and recomputes from the full domain stream
  each call. Storage-internals omission and waived-warning annotations remain unmodeled until a
  real Plan/Debrief PR actually needs them.

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
| Imaging targets                    | Training Site Alpha (32°N 34.8°E) — fictional                                                                                                                                    | simulated  | close to GS-Home, so a real imaging pass and a downlink contact fall within the same orbit                                                                                                                    |
| Orbit                              | Synthetic TLE, NORAD 90001 (a reserved/unassigned catalog number, chosen so it can never collide with a real object), sun-synchronous ~500 km altitude, near-circular ("frozen") | simulated  | inclination 97.4°, eccentricity 0.0001, mean motion ≈ 15.24 rev/day (period ≈ 94.4 min); validated against `src/core/tle/omm.ts`'s own checksum/SGP4-init logic in `asteria1.test.ts`, not hand-verified only |

## Scenario definition

`ScenarioDefinition` (`src/contracts/scenario.ts`) bundles a satellite profile, its synthetic TLE,
ground stations, imaging targets, and a simulation start time into one loadable unit.
`checkScenarioConsistency` composes `checkProfileConsistency` with scenario-level checks (at least
one ground station, no duplicate station ids, at least one imaging target, no duplicate target
ids, a well-formed `startTime`) — a scenario that fails this should be treated as a hard load-time
error, per the Plan workspace's `HardBlock` severity. `targets` is what the four Validator rules'
`ForecastService`-backed callers (`findImagingOpportunities`, still not wired into any UI) will
forecast access windows against — before this, no scenario had a concrete point of interest to
image, so nothing could call that forecasting function with real geometry.

## Plan validation

`ValidationFinding` (`src/contracts/validation.ts`) is the shape every Plan-workspace rule reports
in:

```ts
interface ValidationFinding {
  code: string;
  severity: 'HardBlock' | 'WaivableWarning' | 'Info';
  message: string;
  why: string; // the physical/logical explanation, with the actual numbers
  suggestedFix?: { label: string }; // placeholder — no PlanAction type exists yet to wire a real fix to
  affectedEntities: EntityRef[]; // { kind: 'task' | 'command' | 'contact' | 'target' | 'station' | 'dataProduct', id }
  waivable: boolean; // true only for WaivableWarning
  provenance: Provenance;
  source: string; // rule id, e.g. 'rules/storage-budget@1'
}
```

`HardBlock` disables committing a plan outright (no override for a physics/capacity violation);
`WaivableWarning` allows committing only after an explicit `WarningWaived` operator action;
`Info` never blocks anything.

The first concrete rule, `checkStorageBudget` (`src/core/validation/storageBudget.ts`), composes a
`SatelliteProfile` and the current `TruthState` to decide whether storing a candidate `DataProduct`
would push onboard storage past `usableStorageGB(profile)` — a `STORAGE_INSUFFICIENT` `HardBlock`
if so, `null` if there's room (the budget is inclusive: exactly at the limit is fine).

The second, `checkRollLimit` (`src/core/validation/rollLimit.ts`), decides whether an imaging
candidate's off-nadir angle exceeds `profile.imaging.maxRollDeg` — an `IMG_ROLL_EXCEEDS_LIMIT`
`HardBlock` if so (there is no waiver for a physically unreachable roll angle), `null` if within
limit (inclusive). It takes the off-nadir angle as an already-computed input (radians, the same
quantity `core/imaging/geometry.ts`'s `offNadirAngle` and `core/imaging/opportunities.ts`'s
`ImagingOpportunity.offNadirDeg` produce from a propagated satellite position and a target) rather
than propagating the satellite itself — that stays `ForecastService`/`findImagingOpportunities`'s
job, keeping this rule module pure and time-independent like `checkStorageBudget`.

The third, `checkContactTiming` (`src/core/validation/contactTiming.ts`), decides whether a
candidate command's `simTime` falls inside its target contact's actual acquisition window. It
scans the domain event log for that `contactId`'s `ContactAcquired@1`/`ContactLost@1` pair rather
than reading a precomputed forecast window, so it always reflects what really happened (a contact
can end early — a real `ContactLost@1` — not just what was predicted). Returns `CMD_BEFORE_AOS`
when the contact hasn't been acquired yet at `simTime`, `CMD_AFTER_LOS` when it has already ended
(inclusive — loss itself already ends the window), or `null` when `simTime` falls inside the
acquired-but-not-yet-lost window. Neither is waivable — there is no uplink outside an actual RF
contact.

The fourth, `checkImagingWindow` (`src/core/validation/imagingWindow.ts`), completes the original
HardBlock code list: does a candidate imaging command's `simTime` fall inside one of the
satellite's actual access windows for that target? Returns an `IMG_OUTSIDE_WINDOW` `HardBlock`
finding if not (not waivable — an access window is physical geometry, not a judgment call), `null`
if `simTime` falls inside any `ImagingOpportunity`'s `[start, end]` window (inclusive). It takes
the candidate's forecast opportunities as an already-computed input — the same
`ImagingOpportunity[]` that `core/imaging/opportunities.ts`'s `findImagingOpportunities` produces
— same pattern as `checkRollLimit` staying pure and time-independent.

## Real Scenario 01 timeline

`buildRealDemoTimeline` (`src/core/scenario/realDemoTimeline.ts`) computes Scenario 01's Capture ->
Store -> Contact -> Downlink event sequence from genuine orbital geometry rather than the
fixed-offset timeline `TrainV2`'s demo used through PR #35–#39: the first daylight imaging
opportunity over Asteria-1's target (`findImagingOpportunities`), then the first subsequent
GS-Home pass (`predictPasses`) long enough to actually clear the resulting product
(`downlinkGB(profile, pass.durationS) >= productGB`). For the fixed Asteria-1 TLE and scenario
`startTime`, that opportunity lands ~59 hours after scenario start (2026-09-09T10:55:53Z) — real
SSO geometry, not a number anyone chose. It is a pure scheduler; it does not itself call any
Validator rule. `realDemoTimeline.test.ts` proves the schedule it produces both runs cleanly
through a real `ScenarioRunner` (Truth State ends with both tasks completed, the product
downlinked, no contact left active) and passes all four Validator rules with zero `HardBlock`
findings when re-evaluated against the same real geometry — the intended happy path for Scenario
01; fault injection is Scenario 02's job (§ Roadmap, not built yet).

**Now wired into `TrainV2`** (a later PR): the UX gap above — ~59 hours out is impractical at
`TrainV2`'s old fastest rate (×60) — is resolved by adding a ×3600 ("1 hour per second") rate
preset and making it the default, rather than jumping the clock or moving the scenario's
`startTime` (rejected: `asteria1.test.ts` asserts `startTime` equals the TLE's own epoch on
purpose, a decision this wiring PR wasn't the place to relitigate).

## Plan workspace (browse mode)

`evaluateImagingOpportunities` (`src/core/scenario/planOpportunities.ts`), rendered by `PlanV2.tsx`
(replacing the Plan workspace's placeholder text), lists real `findImagingOpportunities` output
for Asteria-1's target over the next 30 days and evaluates each one against `checkRollLimit` and
`checkImagingWindow` — the two Validator rules that depend only on the candidate itself. For the
real Asteria-1 geometry this genuinely produces a mix of clean and roll-limited candidates (10 of
27 over a real 30-day window at the time this was written), not a contrived example.

Deliberately does not evaluate `checkStorageBudget` or `checkContactTiming` on its own: both need
state a single-candidate browse view has no access to in isolation (an accumulated plan for
storage; a real domain event log with recorded contact acquisition for timing). `PlanV2` closes
that gap for storage by running the browse list's candidates through `evaluatePlanDraft` (below)
when an operator adds one to a draft — `checkContactTiming` still has nothing to evaluate here,
since imaging candidates carry no contact.

## Plan draft accumulator

`evaluatePlanDraft` (`src/core/scenario/planDraft.ts`) is the first real multi-candidate use of the
Validator rules: given an ordered list of `PlanCandidate`s — imaging and downlink — it evaluates
each in sequence against a running `TruthState` fold, as if every earlier accepted candidate
actually happened, rather than each candidate seeing an empty or already-current Truth State in
isolation.

An **imaging candidate** (each carrying the specific real `ImagingOpportunity` chosen for it) runs
`checkRollLimit`/`checkImagingWindow`, then folds `checkStorageBudget` via the real
`applyDomainEvent`. A candidate with any finding does not count toward storage for the candidates
after it (a plan that can't commit a capture doesn't actually put anything in storage for it).
Proven against real Asteria-1 geometry: six real clean opportunities over 30 days genuinely exhaust
the 6 GB budget on the sixth, the same `maxProducts(PAN) = 5` figure from the storage model above.

A **downlink candidate** (a real ground contact's duration plus the ids of earlier imaging
candidates in the same draft whose products it's assigned to clear) runs the new
`checkContactCapacity` rule (`src/core/validation/contactCapacity.ts`, `CONTACT_TOO_SHORT_FOR_PRODUCT`
— the last of the codes the original plan's rule table listed) against those products' real total
size and the contact's real `downlinkGB` capacity, plus a causal-ordering check this accumulator
owns directly (`DOWNLINK_PRODUCT_MISSING`): a referenced product must actually be onboard at that
point in the sequence — never captured, blocked by an earlier finding, or already cleared by an
earlier downlink candidate in the same draft all fail identically, since none of them leaves
anything to actually downlink. A cleared product's storage is freed via the real
`DownlinkCompleted@1` event, the same way `TruthState` already models it. Proven against real
`predictPasses` output over GS-Home: real passes exist on both sides of a 6 GB (5-PAN) load's real
capacity threshold, and a short real pass (157.5 s, ≈2.578 GB capacity) genuinely cannot clear
products a longer real pass (435.9 s, ≈7.799 GB) clears without issue.

`PlanV2` now wires this accumulator into the browse list itself: an "Add to plan"/"Remove" toggle
on each opportunity row builds an ordered draft (its own surface below the browse list), each
draft row showing its own findings and the running storage total after it, and a header showing
the plan's total usage against `usableStorageGB`. This is still **local component state, not a
real committable plan** — there's no `CommandSubmitted`/plan data model or commit flow yet, so
adding/removing a candidate here records nothing to an event log and produces no `DomainEvent`.
That commit flow is the Plan workspace's next real step. `PlanV2`'s selection UI is itself still
**imaging-only**: `evaluatePlanDraft` supports downlink candidates now, but there's no ground-contact
browse/selection UI yet to build one from — that UI is separate follow-up work, not this section.

## Debrief view

`buildDebriefTimeline` (`src/core/debrief/debriefTimeline.ts`) is the first thing to actually show
Truth State and Operator Observables side by side, rather than just documenting that they can
diverge: one row per real `DomainEvent`, each carrying the `TruthState` right after that event
alongside `OperatorObservables` computed at that same simTime from the records seen so far.
`DebriefV2.tsx` (a new Rail workspace) replays `buildRealDemoTimeline`'s real Scenario 01 story —
the same geometry-driven schedule `TrainV2` runs live — to completion in one bulk `advance`, then
renders the timeline with a "Lag" indicator on any row where Truth already lists an active contact
Observables hasn't confirmed yet. Concretely, on the real Asteria-1 run this always lands on
`ContactAcquired@1` and the `TaskStarted@1` right after it (same simTime): Truth shows the contact
active immediately, Observables doesn't confirm it until `profile.downlink.acquisitionS` seconds
later — the exact lag this document has described by name since `TruthState`'s introduction (PR
#31), now something a viewer can actually see rather than take on faith.

Deliberately a replay of the fixed demo run, not a live/selectable session: there's no persisted
session log to browse yet, so this is the same "basic, real data, no session picker" scope every
other workspace here started from. The replay itself runs in a `useEffect` (not a render-time
`useMemo`) precisely because it's the same non-trivial real SGP4 search `TrainV2` already does in
an effect for the same reason — computing it synchronously during render would delay React
committing anything else in that update (e.g. a Rail drawer close transition triggered by the same
navigation) until the whole replay finished.

## Scenario 01 golden replay (determinism)

`canonicalDomainHash`/`canonicalDomainProjection` (`src/core/replay/canonicalDomain.ts`) implement
the "EventLog determinism" check this document has referenced since the event-envelope model was
introduced: a domain event stream stripped of everything that legitimately varies between runs
(`recordId`, `recordedAt`, `globalSequence` — replaced by a 1-based position within the domain-only
projection), reduced to a short deterministic hash (FNV-1a, written from scratch the same way
`src/contracts/ulid.ts` was, rather than adding a hashing dependency).

`scenario01.golden.test.ts` uses this for two things: proving Scenario 01's real demo timeline
(`buildRealDemoTimeline` run through a real `ScenarioRunner` to completion) is genuinely
deterministic — two independent runs, each with a different random seed/ULID and real wall-clock
`recordedAt` values, project to byte-identical canonical output — and a **Golden Regression** test
(per `CONTRIBUTING.md`'s "Testing orbital, RF, and simulation logic": no independent oracle for
"the right event log" exists, so this locks in current behavior rather than proving correctness)
that fails if the real SGP4 geometry, the Asteria-1 profile, or the event-scheduling logic ever
changes what Scenario 01's run actually produces. See `docs/models/tolerances.md` for why this
check uses an exact hash match rather than a numeric tolerance.

## What's not decided here

Session persistence's schema-validation approach (hand-rolled shape checks today, `zod` proposed
but not approved), Train console telemetry channels, and Scenario 02's fault injection are all
still open — later PRs, not this document. All five HardBlock Validator rules this vertical slice
has needed so far (storage, roll-limit, contact-timing, imaging-window, contact-capacity) are now
built; `evaluatePlanDraft`'s accumulator supports both imaging and downlink candidates with causal
ordering between them; a basic Debrief view exists (a fixed-run replay, not a session picker); and
Scenario 01's full real-demo run is now proven deterministic with a golden-regression hash locking
in its current behavior. What's still missing: a ground-contact browse/selection UI in `PlanV2` so
an operator can actually build a downlink candidate (today only imaging candidates have a selection
UI), a real committable-plan/commit flow producing real `DomainEvent`s (today's draft is local UI
state only), and the waiver flow for `WaivableWarning` findings — no rule of that severity exists
yet either.
