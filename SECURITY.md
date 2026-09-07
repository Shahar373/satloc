# Security Policy

## Reporting a vulnerability

SatLoc does not yet have a dedicated private reporting channel — no security email,
no separate contact form. If you find a security issue:

- Open an issue at https://github.com/Shahar373/satloc/issues, or contact the
  maintainer ([@Shahar373](https://github.com/Shahar373)) directly through GitHub.
- If the issue is sensitive (for example, exploitable before a fix ships), say so
  without including exploit details, and wait for a response before disclosing
  specifics publicly.

There is currently no formal response-time commitment — SatLoc is maintained by one
person. This will be revisited as the project grows.

## Scope

This covers the SatLoc application in this repository: the web core, the Tauri
desktop shell, and the GitHub Actions workflows that build and release it. It does
not cover third-party services SatLoc talks to (CelesTrak, the TLE mirror, imagery
providers, GitHub itself) — report issues with those to their own maintainers.
