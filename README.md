# SatLoc

Google Earth-style view of Earth from space with satellites orbiting in real time,
focused on ImageSat International (ISI): EROS-C3 today, EROS-A/B as history.

Installable app: desktop first (Tauri 2), Android next. Built on CesiumJS + satellite.js.

- Design document (Hebrew): [docs/DESIGN.md](docs/DESIGN.md)

Status: milestones M0-M6, M8 (imaging opportunities over targets) and M9 (3D model,
own timeline, shortcuts) done and verified on Windows. Installed copies update themselves from GitHub Releases.
Next: Hebrew UI, Android (M7).

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
npm test             # unit tests
npm run test:e2e     # Playwright smoke test with screenshots
```

Installers are built by GitHub Actions on every push (Actions tab, "SatLoc-windows-installer"
artifact); releases are published as described above.

## Beta notes

- Windows 10/11 with WebView2 (preinstalled on Windows 11; the installer fetches it otherwise).
- Orbital elements come from CelesTrak, which blocks repeated queries for two hours; the app then
  uses a mirror and says so under the satellite list. Positions carry the usual SGP4 error of a
  few kilometres and grow with the age of the element set (shown in the details panel).
- Keyboard shortcuts are listed in Settings. Esc unwinds: field → settings → picking → camera lock → selection.
- Problems: press Ctrl+Shift+I for the developer console and report the message, the SatLoc
  version (Settings → About) and what you did at https://github.com/Shahar373/satloc/issues.
