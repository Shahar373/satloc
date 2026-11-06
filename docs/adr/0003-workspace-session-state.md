# 0003. Keep workspace sessions outside component lifetimes

Date: 2026-09-22
Status: Accepted

## Context

Shell V2 unmounts a workspace on navigation. Plan lost draft selections, Train created a
new runner on every visit, and Debrief created an unrelated complete demo. Explore also lost
its camera/time because its restore snapshot lived in an unmounted hook.

## Decision

Use the existing Zustand state layer for the current imaging draft and one training session.
The training store owns the ScenarioRunner; Train supplies elapsed time only while visible.
Navigation/document hiding pauses training and an explicit action resumes it. Debrief reads
the same immutable published record snapshot. At this stage, only explicit Restart replaces a run. ADR 0004 extends this to a confirmed Plan load.

Explore remains a separate tracking workspace. Its Cesium viewer is destroyed on navigation;
the existing camera/clock restore snapshot is retained for the next mount. There is no hidden
WebGL renderer or coupling between the Explore clock and the headless training clock.

## Consequences

Navigation preserves work without introducing new dependencies or changing the core event
model. Next-event stepping advances through the real scheduler, including simultaneous events.
Plan is still a preview and does not supply commands to Train. These stores are in memory;
closing/reloading the app discards the draft/run. Durable session UI and an executable Plan
remain the next milestone, not implicit features of this change.

## Follow-up

[ADR 0004](0004-executable-plan-snapshot.md) implements the Plan handoff while retaining this
in-memory ownership and navigation behavior. Durable save/resume remains separate work.
