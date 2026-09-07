# Sun elevation reference validation

`sunElevationAt()` (`src/core/imaging/geometry.ts`) derives the Sun's elevation above a
ground point's horizon from `satellite.js`'s `sunPos()` — Vallado's low-precision solar
ephemeris (accuracy ~0.01°, valid 1950–2050; see the header comment in
`satellite.js`'s `sun.js`, itself a port of Vallado's `sun.mat`).

`geometry.test.ts`'s "sun elevation independent reference" block validates this against a
**separately published, differently derived** solar-position algorithm: Jean Meeus,
_Astronomical Algorithms_, 2nd ed., chapter 25 ("Solar Coordinates"), low-precision method
(also ~0.01° accuracy, same 1950–2050-ish validity window — comparable rigor, independent
derivation).

## Why this counts as independent

Vallado's and Meeus's low-precision solar formulas are both truncated series for the same
physical quantity, but they are not restatements of each other the way our GMST check's two
formulas are (see `docs/models/gmst.md`): different polynomial coefficients for mean
longitude/anomaly, a 3-term (Meeus) vs. 2-term (Vallado) equation of center, and Meeus's
version additionally corrects apparent longitude and obliquity for lunar-node nutation
(`Ω = 125.04 - 1934.136T`), which Vallado's simplified version omits. Agreement between the
two to within the stated tolerance is therefore evidence about the underlying physics/model,
not just about two implementations of one formula.

## Method

1. Compute the Sun's apparent right ascension `α` and declination `δ` via Meeus ch. 25
   (low-precision method), independently coded in the test file (not reusing `sunPos()` or
   any other project code).
2. Compute the Greenwich Hour Angle from `gmstReferenceDeg()` — the same from-scratch GMST
   implementation validated independently in `sgp4.test.ts` (see `docs/models/gmst.md`) — so
   this test does not depend on `gstime()`/`gmstAt()` either.
3. Local hour angle `H = GMST + longitude - α`.
4. Elevation via the standard spherical-trig formula:
   `elevation = asin(sin(lat)·sin(δ) + cos(lat)·cos(δ)·cos(H))`.

None of this reuses `sunPos()`, `sunDirectionEcf()`, or `sunElevationAt()`'s own code —
only the final numeric comparison is against `sunElevationAt()`'s output.

## Tolerance

`0.5°`, matching the ~0.01–0.02° combined error budget of two independent low-precision
(1950–2050) solar ephemerides, per Plan v3 §6's stated tolerance for this check (chosen
because `satellite.js`'s `sunPos` is explicitly a low-precision model, not because either
formula is imprecise at the 0.5° level — both are good to ~0.01° individually).

## Provenance

- Meeus, J. (1998). _Astronomical Algorithms_, 2nd ed. Willmann-Bell. Ch. 25 (low-precision
  method, accuracy 0.01°, 1950–2050).
- Vallado, D. (2013). _Fundamentals of Astrodynamics and Applications_, 4th ed. — as
  implemented in `satellite.js`'s `sun.js` (ported from Vallado's `sun.mat`).
