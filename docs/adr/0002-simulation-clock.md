# 2. An independent SimulationClock, mirrored from Cesium rather than replacing it

Date: 2026-09-07
Status: Accepted

## Context

Phase C's operator-simulation vertical slice (`docs/DESIGN.md`'s plan, §3) needs a simulation-time
source that a `ForecastService` worker, an `EventLog`/`Scheduler`, and unit/replay tests can all
read deterministically — none of which have (or should need) a live Cesium `Viewer`. But this
project's existing rule (`CLAUDE.md`) is that simulation time comes from `viewer.clock.currentTime`
when a viewer is attached, never from `Date.now()` in satellite math — and `useViewerStore`
already mirrors the Cesium viewer's clock into Zustand for the UI. Two independently-advancing
clocks (Cesium's internal one, plus a separate timer driving a new clock) would drift apart over
time from floating-point summation and frame-timing differences, which is unacceptable for a
tool whose whole point is a consistent, replayable simulation time.

## Decision

Introduce `SimulationClock` (`src/core/clock/SimulationClock.ts`) as a pure, dependency-free class:
a `Date` plus a rate multiplier and running/paused flag, advanced only by explicit `advance(realElapsedMs)`
calls or direct `seek()`/`setMultiplier()`/`pause()`/`resume()` — it never reads the wall clock
itself. This makes it usable identically in a worker, in a deterministic test (advance by a known
delta), or driven externally.

When a Cesium viewer is attached, it stays authoritative: `attachClockAdapter` (`src/viewer/ClockAdapter.ts`)
mirrors `viewer.clock` into a `SimulationClock` one-directionally on every tick (the same pattern
`useViewerStore.attach()` already uses for the UI), so `SimulationClock` never independently
accumulates its own drift while a viewer is present. `advance()` exists for the headless case —
running a scenario without a mounted globe (a worker, a test, or Train/Debrief screens that don't
need the 3D globe).

`createClockStore` (`src/state/clock.ts`) wraps a `SimulationClock` in a Zustand hook for React
components. It is a factory, not a single app-wide singleton like `useViewerStore` — Phase C's
Train console, Debrief, and replay each need their own independently seekable clock (replaying a
past session's log must not move the clock a live scenario is still running on).

None of this is wired into `AppV2`/`useViewerStore` yet — it lands as unwired foundation, the same
pattern `src/contracts/` used, to keep this PR small and reviewable. Wiring happens once the
Scheduler/Train console that actually consumes it exists.

## Consequences

- `src/core/` gains a clock abstraction fully covered by deterministic unit tests, with zero DOM/
  Cesium/React imports, matching the existing `src/core/` boundary.
- `src/viewer/ClockAdapter.ts` is the one place that bridges Cesium's clock into this shape;
  it has no unit test of its own (consistent with the rest of `src/viewer/`, which is Cesium-
  dependent and verified through e2e/manual Playwright checks instead).
- A future scenario/session layer can run entirely headless (worker or test) against the same
  `SimulationClock` interface a live viewer would drive, without special-casing either path.
- If a second, truly independent clock source is ever needed at the same time as a live viewer
  (e.g. two viewers), each needs its own `SimulationClock` instance — this ADR does not introduce
  any global clock state.
