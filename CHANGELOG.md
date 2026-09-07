# Changelog

Each section becomes the release notes of that version (see scripts/release-notes.mjs).

## 0.4.0

A new, product-grade desktop UI (Shell V2) replaces the original interface everywhere.

- Design: two full-mockup design alternatives compared and merged into a hybrid direction — a persistent Top Bar, workspace rail, Inspector, and Dock, chosen for a calm, precise operations-console feel over a document-browser layout.
- Globe: the real Cesium globe, satellites, orbit paths, ground tracks, footprints, and the observer marker all render in the new interface exactly as before.
- Language: full English/Hebrew interface with right-to-left layout mirroring (verified pixel-for-pixel, not just visually) and a language toggle that remembers your choice between sessions.
- Search: a command palette (⌘K / Ctrl+K) finds and jumps to any satellite by name or NORAD ID.
- Small screens: the workspace rail and Inspector collapse into on-demand panels below 1200 px wide, so the app stays usable on an 900×600 window.
- Updates: the "a new version is available" notice moved to the new interface, unchanged in what it does.

## 0.3.1

Engineering stabilization: no new features, tightened security and testing groundwork for the next round of feature work.

- Security: the app's Content Security Policy now also restricts `<base>` tag injection, form submission targets, and framing (`base-uri`, `form-action`, `frame-ancestors`).
- Automation: the scheduled satellite-data refresh job can no longer write to any branch other than the release branch, even by mistake.
- Contributor docs: a CONTRIBUTING guide, a security reporting policy (private GitHub advisories), an ADR template, and a PR template.
- Testing: satellite-clock (GMST) and sun-elevation calculations are now checked against independently-implemented reference formulas, not just against themselves.

## 0.3.0

Beta hardening: a full review of the project with about a hundred fixes. Highlights:

- Imaging: correct left/right side of the target, access windows found at small roll limits, no roll above the limit, windows still open at the end of the forecast are kept.
- Passes: a pass in progress at the end of the window is kept; a decayed or malformed satellite now says so instead of "No passes".
- Data: refresh never drops a satellite whose fetch failed, CelesTrak is asked at most once per two hours per query (and only counted when it answered), the mirror cannot replace newer elements with older ones, element sets refresh in the background, TLE lines are checksum-verified.
- Globe: imagery and terrain failures show a warning instead of a black globe, ground track without a hole, far fewer per-frame rebuilds, changing imagery keeps the clock and camera, picking respects terrain.
- UI: usable date and number fields, a top bar that fits 900 px windows, collapsible panels, a pinned list, keyboard-operable timeline, Escape unwinds one level at a time, shortcuts listed in Settings, an error screen instead of a black window.
- Desktop: window size and position are remembered.

## 0.2.1

- Element refresh: honest source label, CelesTrak at most once per 2 hours, mirror fallback with calmer messages.

## 0.2.0

- Auto-update from GitHub Releases.
