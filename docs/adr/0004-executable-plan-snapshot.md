# 0004. Compile a validated operator plan into an independent training snapshot

Date: 2026-09-23
Status: Accepted

## Context

The Plan draft and guided Train session have independent lifetimes (ADR 0003), but an operator
could not execute selected captures or select ground contacts. Directly reading the mutable
draft from the runner would let later edits silently change an ongoing run and its debrief.

## Decision

Keep the editable draft in the Plan store. A pure `compilePlan` in `src/core/scenario/` sorts and
validates the entire candidate sequence, requires a nonblank reason for each current warning,
and clones the accepted candidates into a `CompiledPlan` containing tasks and scheduled events.
The inputs are trusted forecasts from the bundled scenario, not a public plan-import format.

The training store builds a new runner and schedule before replacing the active one. It appends
`PlanCommitted`, per-task `CommandSubmitted`, `WarningWaived` and `CommandAccepted` records at
the scenario start. Commands are preloaded for this training model; acceptance does not model
an RF uplink outside a contact. Execution/domain records and waivers refer backward to their
command submission. The contact schedule includes acquisition time and product transfer time.

The UI asks for explicit confirmation before replacing an existing run. Draft edits clear all
waiver decisions and invalidate replacement confirmation. Restart repeats the committed snapshot;
Train and Debrief continue to share one event log. Entering Train without a plan keeps Scenario 01.

Use a conservative single-spacecraft resource policy: reserve full imaging access windows and
full selected contact windows without overlap, including after transfer finishes. Every capture
must be assigned to one later download. This avoids implying simultaneous operation that the
training profile does not model. Storage accounting uses decimal GB rounded to byte precision.

## Consequences

Operators can execute their own PAN/MS and station choices without changing the event-envelope,
clock or persistence contracts. Invalid plans leave an existing runner untouched. Snapshot edits
and warning reasons are auditable in the same run that produced the products and downloads.

This remains an in-memory workflow. Closing/reloading loses the draft and run. The existing
session-file format stores records but not the compiled plan and pending schedule; durable
save/resume needs a separately versioned design. Slew/settling, energy, thermal constraints,
RF faults and uplink scheduling are not newly simulated. Overlap rejection is intentionally more
conservative than a future attitude/resource scheduler could be.
