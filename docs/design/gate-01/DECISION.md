# Design Gate 01 — decision

Two full alternatives, each with Explore (English), Plan (English), and Train (Hebrew, RTL)
screens, rendered at 1440×900 and 900×600. Source: `a/`, `b/`, screenshots in `screenshots/`.
Both variants share `shared/tokens.css` (palette, spacing, type scale) and commit to the same
brief: a calm, precise operations console for a professional space company — not a hacker
terminal, not neon sci-fi, not a generic SaaS dashboard.

## Variant A — "Command Deck"

Top bar (workspace tabs + clock) · 56px icon-only rail · main content · 340px **persistent**
right Inspector · 200px bottom Dock (timeline / catalog / procedures). Everything relevant is
visible simultaneously — the layout of a real mission-control console.

## Variant B — "Focused Workstation"

Top bar with a command-palette-style search · 240px labeled sidebar (workspace switcher +
merged contextual list, e.g. tracked satellites) · large main content · Inspector as a
**floating overlay drawer**, shown only when something is selected · slim 48px bottom bar.
More breathing room, closer to a modern professional app (Figma/Linear-style) applied to an
ops tool.

## Scorecard

| Dimension             | A — Command Deck                                                                                                                                 | B — Focused Workstation                                                                                                            | Notes                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Operator efficiency   | **Better for Train/NOC** — alarms, telemetry, storage/link gauges stay visible with zero clicks, which matters most in a live-monitoring console | Better for focused single-task work (reviewing one plan item)                                                                      | SatLoc's differentiator is the always-on monitoring surface (Explore, Train), so this weighs toward A |
| Information hierarchy | Denser, more simultaneous zones                                                                                                                  | **Cleaner** — command palette anchors navigation, sidebar merges nav + context in one scan                                         | B edges ahead                                                                                         |
| Accessibility         | **Simpler** — no show/hide state, nothing to focus-trap                                                                                          | Overlay drawer needs deliberate focus-trap + Escape-to-close work                                                                  | A lower net a11y risk                                                                                 |
| RTL                   | Mirrors correctly via CSS Grid + logical properties (verified in `a/train.html` screenshot)                                                      | Same technique applies; not separately re-verified for the drawer's mirrored position                                              | Tie — both are sound, same underlying technique                                                       |
| Density               | Matches "moderately dense ops console" brief closely                                                                                             | Reads slightly closer to a general-purpose SaaS tool                                                                               | A closer to the brief                                                                                 |
| Performance           | No meaningful difference at this stage (mockup, not live data)                                                                                   | Same                                                                                                                               | Tie                                                                                                   |
| Implementation risk   | **Lower** — fixed grid areas, no portal/overlay/z-index/focus-trap machinery                                                                     | Higher — floating drawer needs its own stacking/focus/responsive-collapse logic, on top of the sidebar's own collapse below 1200px | A lower risk                                                                                          |
| Holds up at 900×600   | Confirmed — rail/main/inspector/dock all stay legible (`a-explore-900x600.png`)                                                                  | Confirmed — sidebar/main/drawer stay legible (`b-train-900x600.png`)                                                               | Tie                                                                                                   |

## Decision: hybrid, Command Deck as the structural base

Chosen structure for Shell V2:

- **From Variant A** (kept as-is): the persistent Top Bar + Rail + **always-visible** Inspector
  - Dock. This is what makes Explore and Train read as a live console rather than a document
    browser, it's lower a11y/implementation risk, and it's what was confirmed to hold up at
    900×600 without any responsive rework.
- **From Variant B** (adopted): the top-bar command-palette-style search (`⌘K` — "jump to
  satellite, task, or command") replaces A's floating in-canvas search box; and the rail gets
  a hover/expand affordance to show workspace labels, borrowing B's discoverability win
  without permanently committing A's compact 56px rail to B's 240px labeled sidebar (which
  would leave only ~320px of main content at 900px width once combined with the persistent
  340px Inspector — checked against the screenshots, this combination does not hold up).

This is explicitly a **hybrid**, one of the two outcomes the product decision already allows
("Workstation professional desktop, hybrid GUI direction"). Drawer behavior below 1200px
(sidebar and Inspector both collapse to on-demand overlays) applies to this hybrid exactly as
already decided, independent of which variant supplied the ≥1200px baseline.

Fonts, icon set (`lucide-react`), i18n (`i18next`/`react-i18next`), and the exact token values
in `shared/tokens.css` carry forward into the real design-tokens PR; the Hebrew/RTL and mixed
Latin+Hebrew+numeral handling demonstrated in `a/train.html` and `b/train.html` (bidi-isolated
technical tokens inside Hebrew sentences, mirrored grid layout, tabular numerals) is the
pattern the real implementation follows.
