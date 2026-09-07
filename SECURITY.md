# Security Policy

## Reporting a vulnerability

Report security vulnerabilities privately through GitHub's Private Vulnerability
Reporting for this repository:

https://github.com/Shahar373/satloc/security/advisories/new

This creates a private advisory visible only to you and the maintainer — do not
open a public issue for a vulnerability, and do not include exploit details in a
public issue or PR.

For general, non-sensitive security questions (for example, "does SatLoc do X"),
a public issue at https://github.com/Shahar373/satloc/issues is fine.

There is currently no formal response-time commitment — SatLoc is maintained by one
person. This will be revisited as the project grows.

## Supported versions

SatLoc does not maintain long-term-support branches. Only the latest released
version is supported with security fixes; older versions are not patched.

## Scope

This covers the SatLoc application in this repository: the web core, the Tauri
desktop shell, and the GitHub Actions workflows that build and release it. This
includes vulnerabilities in how SatLoc integrates with a third-party service (for
example, an SSRF or injection issue in how SatLoc calls CelesTrak, the TLE mirror,
or an imagery provider). It does not cover a vulnerability in the third-party
service itself (for example, a bug in CelesTrak's own infrastructure) — report
those to that service's own maintainers.
