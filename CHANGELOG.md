# Changelog

Each section becomes the release notes of that version (see scripts/release-notes.mjs).

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
