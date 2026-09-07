# 1. Record architecture decisions

Date: 2026-09-07
Status: Accepted

## Context

SatLoc is moving from a satellite tracker toward a larger operator simulator (see the
SatLoc upgrade plan). Along the way there will be decisions that introduce new
architectural boundaries or change how core state is owned — for example a
`SimulationClock`, the split between Truth State and Operator Observables, or the
event-log format. These need a durable written record of _why_, not just _what_, so a
later contributor doesn't have to reverse-engineer intent from a diff or a chat log.

## Decision

Record significant, hard-to-reverse architectural decisions as ADRs (Architecture
Decision Records) under `docs/adr/`, one file per decision, numbered sequentially,
using the template in `docs/adr/0000-template.md`.

"Significant" means: introduces a new architectural boundary or pattern, changes how
core state is owned, or would be expensive to reverse later. Small implementation
choices, refactors within an existing pattern, and anything easily reverted in a single
PR don't need one.

## Consequences

Decisions get a short, findable written record instead of living only in commit
messages or PR descriptions. An ADR is never edited to reflect a later reversal — a
superseding decision gets its own new ADR that says so and links back to the one it
replaces.
