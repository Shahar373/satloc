# SatLoc

Google Earth-style globe with satellites in real time, focused on ImageSat International (ISI).
Web core (React + TypeScript + Vite + CesiumJS + satellite.js) inside a Tauri 2 shell.
Desktop (Windows first) now, Android later.

Read `docs/DESIGN.md` (Hebrew) before changing architecture: it holds the decisions,
algorithms, milestones (M0-M7) and the reasons behind them.

## Commands

- `npm install` — also copies Cesium runtime assets to `public/cesium` (gitignored).
- `npm run dev` — browser at http://localhost:5173. `?imagery=offline` forces bundled tiles.
- `npm run typecheck` / `npm test` / `npm run build`
- `npm run test:e2e` — Playwright smoke test; screenshot lands in `test-results/globe.png`.
- `npm run tauri dev` / `npm run tauri build` — desktop app (needs Rust + WebView2 on Windows).
- `npm run icons` — regenerate `src-tauri/icons` from the procedural source image.

## Layout rules

- `src/core/` is pure TypeScript: no DOM, no React, no Cesium imports. Unit-test everything here.
- `src/platform/` is the only place that knows whether we run in Tauri or a browser.
- `src/viewer/` owns Cesium; `src/ui/` owns React components; `src/state/` owns zustand stores.
- Simulation time comes from `viewer.clock.currentTime`, never from `Date.now()` in satellite math.

## Environment notes

- The remote dev sandbox blocks celestrak.org and all imagery hosts; only GitHub and npm are reachable.
  Live TLE fetches and online imagery are verified on the developer's Windows machine.
- crates.io downloads are blocked in the sandbox, so the Rust shell is compiled only in CI.
