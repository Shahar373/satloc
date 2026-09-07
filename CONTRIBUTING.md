# Contributing to SatLoc

SatLoc is maintained by one person today; this document keeps things predictable
rather than adding process for its own sake.

## Setup

```
npm install
npm run dev
```

See `README.md` for the full command list and `CLAUDE.md` for the module layout rules
(`src/core` is pure TypeScript, `src/platform` is the only Tauri/browser boundary,
etc.) — read `CLAUDE.md` before changing architecture.

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

Don't mix them in one commit or PR:

- **Formatting-only** changes (e.g. a Prettier pass) get their own commit with zero
  logic diff — no renames, no reordered imports beyond what the formatter does,
  nothing manual. Verify with `git diff --stat` plus the full check list above; build
  output should be unaffected.
- **Refactors** (no behavior change) are their own commit/PR, verified the same way,
  with a note on what stayed equivalent and how that was checked.
- **Behavior changes** get their own PR, with the actual before/after described and
  tests covering the new behavior.

Mixing these makes review much harder — a reviewer can't tell "safe to skim" from
"read carefully" apart.

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
