# SatLoc

Google Earth-style view of Earth from space with satellites orbiting in real time,
focused on ImageSat International (ISI): EROS-C3 today, EROS-A/B as history.

Installable app: desktop first (Tauri 2), Android next. Built on CesiumJS + satellite.js.

- Design document (Hebrew): [docs/DESIGN.md](docs/DESIGN.md)

Status: milestones M0-M6, M8 (imaging opportunities over targets) and M9 (3D model,
own timeline, shortcuts) done and verified on Windows. Installed copies update themselves from GitHub Releases.
Next: Hebrew UI, Android (M7).

## Releasing

Push a tag `vX.Y.Z` (matching the version in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`). The Release workflow builds the installers, signs the updater artifacts
with the repository secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,
and publishes the release with `latest.json`, which running apps pick up.

## Develop

```
npm install          # also copies Cesium assets
npm run dev          # browser, http://localhost:5173
npm run tauri dev    # desktop window (needs Rust; WebView2 on Windows)
npm test             # unit tests
npm run test:e2e     # Playwright smoke test with screenshots
```

Installers are built by GitHub Actions on every push (Actions tab, "Windows installer" artifact)
and published to a draft GitHub Release when a `v*` tag is pushed.
