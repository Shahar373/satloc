# SatLoc

Google Earth-style view of Earth from space with satellites orbiting in real time,
focused on ImageSat International (ISI): EROS-C3 today, EROS-A/B as history.

Installable app: desktop first (Tauri 2), Android next. Built on CesiumJS + satellite.js.

- Design document (Hebrew): [docs/DESIGN.md](docs/DESIGN.md)

Status: milestones M0-M3 and M5 done (globe, ISI satellite in real time, time control,
footprint/swath, pass prediction). Next: full catalogue (M4), polish (M6), Android (M7).

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
