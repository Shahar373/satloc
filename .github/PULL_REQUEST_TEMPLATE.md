## Summary

<!-- What changed and why. -->

## Type of change

- [ ] Formatting only (no logic change)
- [ ] Refactor (no behavior change)
- [ ] Behavior change / new feature
- [ ] Bug fix
- [ ] Docs / governance
- [ ] CI / tooling

## Scope

**In scope:**

**Explicitly out of scope:**

## Testing

- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (if the change touches the app, not just docs/config) — N/A
      if it doesn't
- [ ] Changes to `src/core/propagation`, `src/core/passes`, `src/core/imaging`, or
      RF/link math are validated per `CONTRIBUTING.md`'s testing rules (independent
      reference or documented golden regression) — N/A if this PR doesn't touch that
      code

Any item above that doesn't apply to this PR can be marked N/A instead of left
unchecked — say why in the Summary if it isn't obvious.

## Review checklist

Mark each domain reviewed, or N/A if it doesn't apply to this change (solo-maintainer
self-review is fine — see `CONTRIBUTING.md`).

- [ ] Software — code quality, boundaries, error handling
- [ ] UX/UI — if this touches `src/ui/` or `src/viewer/`
- [ ] Satellite/RF — if this touches orbital, imaging, or RF logic (`src/core/**`)
- [ ] QA — tests updated/added; the checks above pass
- [ ] Security — if this touches `platform/`, `src-tauri/`, CI, CSP, or dependencies

## Definition of Done

- [ ] All checks above are green
- [ ] ADR added when this PR introduces a significant architectural decision;
      otherwise N/A
- [ ] `CHANGELOG.md` updated if this changes user-facing behavior; otherwise N/A
- [ ] Docs (`README.md` / `CLAUDE.md` / `docs/DESIGN.md`) updated if commands,
      architecture, or behavior changed; otherwise N/A
