# Contributing to SatLoc

SatLoc is maintained by one person today; this document keeps things predictable
rather than adding process for its own sake.

## Setup

```
npm ci
npm run dev
```

`npm ci` installs exactly what `package-lock.json` pins and matches what CI runs.
Use `npm install` only when you're intentionally changing a dependency and updating
`package-lock.json`.

See `README.md` for the full command list. For architecture, start with
`README.md`, `docs/DESIGN.md`, and `docs/adr/` — those are the docs contributors
should read before changing architecture. `CLAUDE.md` holds guidance for AI coding
tools working in this repo (layout rules, dev commands); it's a useful secondary
reference but isn't the primary architecture doc. If a change makes any doc
(`README.md`, `CLAUDE.md`, `docs/DESIGN.md`, an ADR) inaccurate, update that doc in
the same PR.

## Before you push

Run what's relevant to your change:

```
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
```

These are the same checks CI runs (`.github/workflows/ci.yml`, job "Web (lint, format,
typecheck, unit, build, smoke)"). A second job ("Tauri shell (cargo check)") runs
`cargo fmt --check` and `cargo clippy` for `src-tauri/`; a third ("Windows installer
(tauri build)") does a full Tauri build.

## Branch and PR workflow

1. Branch off the current default branch
   (`claude/earth-app-realtime-satellites-qteq9b` at the time of writing — check
   `git remote show origin` if unsure).
2. Open a pull request into the default branch. Keep PRs small and single-purpose —
   see "Separate formatting, refactoring, and behavior changes" below.
3. CI must be green (all three jobs above) before merging.
4. When merging: if the PR's history is referenced elsewhere by commit SHA (for
   example `.git-blame-ignore-revs`), use GitHub's "Create a merge commit" — squash
   and rebase both rewrite commit SHAs and would break that reference. Otherwise
   either is fine; this repo has used merge commits so far.

## Separate formatting, refactoring, and behavior changes

Never mix them **in the same commit** — a commit that reformats code must not also
change logic, and vice versa:

- **Formatting-only** changes (e.g. a Prettier pass) get their own commit with zero
  logic diff — no renames, no reordered imports beyond what the formatter does,
  nothing manual. Verify with `git diff --stat` plus the full check list above; build
  output should be unaffected. A broad, repo-wide reformat gets its own PR, or a
  clearly isolated commit inside a one-time tooling-setup PR (as in
  `chore: establish linting and formatting baseline`, which paired tooling config
  and a format-only pass as separate commits in one PR).
- **Refactors** (no behavior change) are their own commit, verified the same way,
  with a note on what stayed equivalent and how that was checked. Kept in their own
  PR when practical, so review doesn't have to separate "safe to skim" from
  "read carefully" on top of everything else.
- **Behavior changes** get their own commit and, when practical, their own PR, with
  the actual before/after described and tests covering the new behavior.

The goal is reviewability, not a rule for its own sake — if a small PR naturally
combines a couple of these as separate, clearly-labeled commits, that's fine; what
matters is that no single commit mixes mechanical and semantic changes.

## Testing orbital, RF, and simulation logic

Changes under `src/core/propagation/`, `src/core/passes/`, `src/core/imaging/`,
`src/core/geometry/`, or any future RF/link-budget code need more than "the existing
tests still pass":

- If an independent source of truth exists (a published reference vector, a textbook
  formula, an independent tool's output), test against it and say so — in the test
  file and in the PR description.
- If no independent source exists yet, the test is a **golden regression**: it locks
  in this implementation's current output so a future change that silently alters it
  gets caught. Say so explicitly — a golden regression proves stability, not
  correctness, and shouldn't be presented as validation.
- Don't invent a "reference" from a live or changing source (e.g. the bundled TLE
  snapshot) — it drifts and isn't reproducible.

## Architecture decisions

Significant, hard-to-reverse architectural decisions (new state-ownership boundaries,
new core patterns) get an ADR under `docs/adr/`, using `docs/adr/0000-template.md`.
Small refactors and easily-reverted choices don't need one.

## Security

See `SECURITY.md`.
