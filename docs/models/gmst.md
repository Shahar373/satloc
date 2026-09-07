# GMST reference validation

`gmstAt()` (`src/core/propagation/sgp4.ts`) delegates to `satellite.js`'s `gstime()`. This
document backs an **independent reference test** (`sgp4.test.ts`, describe block "GMST
independent reference") that re-implements Greenwich Mean Sidereal Time from a published
formula, separately from `gstime()`'s own code.

## Formula

IAU 1982 GMST, as given in Jean Meeus, _Astronomical Algorithms_, 2nd ed., chapter 12,
equation 12.4 (equivalent to Vallado, _Fundamentals of Astrodynamics and Applications_,
eq. 3-45, restated in degrees instead of time-seconds):

```
T = (JD - 2451545.0) / 36525          Julian centuries since J2000.0 (JD in UT1)

GMST(deg) = 280.46061837
          + 360.98564736629 * (JD - 2451545.0)
          + 0.000387933 * T^2
          - T^3 / 38710000
```

reduced to `[0, 360)`. `JD` is the standard Julian Date (Gregorian calendar, UT1 treated as
UTC — the sub-second UT1-UTC offset is irrelevant at this test's tolerance).

## Reference values used

- **J2000.0 exactly** (`2000-01-01T12:00:00Z`, JD = 2451545.0): every term but the constant
  vanishes, so `GMST = 280.46061837508°` by construction of the formula. This is the
  standard, widely-cited zero-point of the IAU 1982 GMST polynomial — no computation is
  needed to produce it, only correct evaluation of the formula at `T = 0`, so it carries no
  risk of transcription/arithmetic error on our side.
- A handful of other UTC instants, where the test's own from-scratch Meeus-formula
  implementation is compared against `gstime()`.

## What this does and doesn't prove

This validates that our GMST implementation (`gstime()`, via `satellite.js`) correctly
implements the standard IAU 1982 formula, checked against an independently-coded
implementation of the same published formula (Meeus's restatement, not a copy of
`gstime()`'s own source) plus one zero-computation citable constant. It is **not** validated
against a second, independently-_derived_ algorithm (e.g. a full IAU 2000/2006 precession
model) — the IAU 1982 expression is the standard for TEME/SGP4 work and is what both
`gstime()` and this test implement. Tolerance: `1e-6` rad, matching float64 evaluation of a
degree-6 polynomial at these magnitudes.

## Provenance

- Meeus, J. (1998). _Astronomical Algorithms_, 2nd ed. Willmann-Bell. Ch. 12, eq. 12.4.
- Vallado, D. (2013). _Fundamentals of Astrodynamics and Applications_, 4th ed. Eq. 3-45.
