# SatLoc

Google Earth-style view of Earth from space with satellites orbiting in real time,
focused on ImageSat International (ISI): EROS-C3 today, EROS-A/B as history.

Installable app: desktop first (Tauri 2), Android next. Built on CesiumJS + satellite.js.

- Design document (Hebrew): [docs/DESIGN.md](docs/DESIGN.md)

Status: v0.5.1 is the latest released baseline. The unreleased desktop work now connects
an operator-authored capture/downlink plan to Train and Debrief, alongside Explore and the
guided fictional Asteria-1 scenario. This is a training model, not an operational flight system.

Start here: [stability milestone and next steps (Hebrew)](docs/STABILITY.md).
Durable save/resume and an installed Windows acceptance check come before expanding into NOC
or Android. Drafts and runs currently survive navigation, but not closing/reloading the app.

## Try the current workflow

- **Explore:** choose a satellite, use time/rate/UTC-jump and camera controls, then switch workspaces.
  The view and simulation time return with you.
- **Plan:** select daylight PAN/MS captures, then later GS-Home/GS-North contacts. Each contact
  downloads the available unassigned captures selected before it. Review storage, timing and
  capacity checks; accept each older-orbit warning with a reason. Load the plan into Train.
- **Train:** your exact plan starts paused. Press Play or Next event; leaving the workspace or
  hiding the app pauses the run. Restart repeats its snapshot. Loading another plan requires
  confirmation if a run already exists. Entering Train before loading a plan still starts the
  guided Scenario 01.
- **Debrief:** inspect that same run's events, including partial runs, with the recorded plan
  decision and warning reasons. Changes to the draft do not change an already-loaded run.

## Releasing

Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` and
push. The Release workflow notices the new version in `tauri.conf.json`, builds the installers,
signs the updater artifacts with the repository secrets `TAURI_SIGNING_PRIVATE_KEY` /
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and publishes release `vX.Y.Z` with `latest.json`, which
running apps pick up. Pushing a `vX.Y.Z` tag or starting the workflow from the Actions tab does
the same; a version that already has a release is skipped.

## Develop

```
npm install          # also copies Cesium assets
npm run dev          # browser, http://localhost:5173
npm run tauri dev    # desktop window (needs Rust; WebView2 on Windows)
npm run lint         # ESLint
npm run format       # Prettier (--write); npm run format:check for CI-style checking
npm run typecheck    # tsc --noEmit
npm test             # unit tests
npm run test:e2e     # Playwright smoke test with screenshots
npm run build        # production build (tsc --noEmit && vite build)
npm run icons        # regenerate src-tauri/icons from the procedural source image
```

Installers are built by GitHub Actions on every push (Actions tab, "SatLoc-windows-installer"
artifact); releases are published as described above.

## Install (beta)

1. Download the newest installer from https://github.com/Shahar373/satloc/releases/latest:
   `SatLoc_x.y.z_x64-setup.exe` (NSIS, per-user install, no admin rights needed).
2. Windows SmartScreen shows "Windows protected your PC" because the build is not code-signed yet:
   choose **More info → Run anyway**.
3. The app updates itself from the same Releases page (Settings → Updates).

On first launch SatLoc contacts celestrak.org and tle.ivanstanojevic.me for orbital elements,
server.arcgisonline.com for imagery and github.com for updates. There is no telemetry.

## Beta notes

- Windows 10/11 with WebView2 (preinstalled on Windows 11; the installer fetches it otherwise).
- Orbital elements come from CelesTrak, which blocks repeated queries for two hours; the app then
  uses a mirror and says so under the satellite list. Positions carry the usual SGP4 error of a
  few kilometres and grow with the age of the element set (shown in the details panel).
- Keyboard shortcuts are listed in Settings. Esc unwinds: field → settings → picking → camera lock → selection.
- Problems: Settings → About → **Copy diagnostics**, then **Report a problem** (opens GitHub) and
  paste them with what you did. Ctrl+Shift+I opens the developer console for details.
