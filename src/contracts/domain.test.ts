import { describe, expect, it } from 'vitest';
import { checkProfileConsistency, downlinkGB, maxProducts, usableStorageGB, type SatelliteProfile } from './domain';

// The exact figures from the operator-simulation plan's §5 worked example (docs/DESIGN.md),
// chosen specifically because 6 GB usable / 1.2 GB per PAN product = 5 max products — a
// deliberately tight budget that makes the "downlink before you run out of storage" scenario
// interesting, unlike an earlier draft's 32 GB / 1.2 GB = 26 (not tested here, just documented
// as the reason these particular numbers were chosen over larger, safer-feeling ones).
const asteria1Profile: SatelliteProfile = {
  id: 'asteria-1',
  name: 'Asteria-1',
  units: 'GB-decimal',
  storage: {
    rawGB: 8,
    reservedGB: 2,
    productGB: { PAN: 1.2, MS: 0.4 },
  },
  downlink: {
    rateMbps: 150,
    acquisitionS: 20,
  },
  imaging: {
    maxRollDeg: 30,
    slewRateDegPerS: 0.5,
    settlingS: 15,
    sunElevationConstraintDeg: 20,
  },
  uplinkKbps: 64,
  provenance: {
    'storage.rawGB': 'assumed',
    'storage.reservedGB': 'assumed',
    'storage.productGB': 'simulated',
    'downlink.rateMbps': 'assumed',
    'imaging.maxRollDeg': 'assumed',
  },
};

describe('usableStorageGB', () => {
  it('is rawGB minus reservedGB', () => {
    expect(usableStorageGB(asteria1Profile)).toBe(6);
  });
});

describe('maxProducts', () => {
  it("matches the plan's worked example: 6 GB usable / 1.2 GB PAN = 5", () => {
    expect(maxProducts(asteria1Profile, 'PAN')).toBe(5);
  });

  it('is floor, not exact division, for MS', () => {
    expect(maxProducts(asteria1Profile, 'MS')).toBe(15); // 6 / 0.4 = 15 exactly
  });
});

describe('downlinkGB', () => {
  it("matches the plan's worked example: an 8-minute contact clears ~8.6 GB (the plan's prose rounds 8.625 to one decimal)", () => {
    expect(downlinkGB(asteria1Profile, 480)).toBeCloseTo(8.625, 5);
  });

  it("matches the plan's worked example: a 4-minute contact clears ~4.1 GB", () => {
    expect(downlinkGB(asteria1Profile, 240)).toBeCloseTo(4.125, 5);
  });

  it('never goes negative when the contact is shorter than the acquisition time', () => {
    expect(downlinkGB(asteria1Profile, 5)).toBe(0);
  });
});

describe('checkProfileConsistency', () => {
  it('accepts the worked-example profile', () => {
    expect(checkProfileConsistency(asteria1Profile)).toEqual([]);
  });

  it('rejects reservedGB >= rawGB', () => {
    const bad: SatelliteProfile = {
      ...asteria1Profile,
      storage: { ...asteria1Profile.storage, reservedGB: 8 },
    };
    expect(checkProfileConsistency(bad).some((v) => v.includes('reservedGB'))).toBe(true);
  });

  it('rejects a product larger than usable storage', () => {
    const bad: SatelliteProfile = {
      ...asteria1Profile,
      storage: { ...asteria1Profile.storage, productGB: { PAN: 100, MS: 0.4 } },
    };
    const violations = checkProfileConsistency(bad);
    expect(violations.some((v) => v.includes('productGB.PAN'))).toBe(true);
    expect(violations.some((v) => v.includes('maxProducts for PAN'))).toBe(true);
  });

  it('a much roomier profile is still consistent — "too roomy to be interesting" is a scenario-design choice, not a consistency violation', () => {
    // The plan's own history records rejecting an earlier 32 GB draft specifically because it
    // yielded too many max products to force any interesting storage trade-off — but that's a
    // judgment call about scenario design, not something checkProfileConsistency should enforce.
    // This only catches genuine contradictions (storage that doesn't physically fit).
    const roomy: SatelliteProfile = {
      ...asteria1Profile,
      storage: { ...asteria1Profile.storage, rawGB: 32 },
    };
    expect(checkProfileConsistency(roomy)).toEqual([]);
    expect(maxProducts(roomy, 'PAN')).toBe(25); // (32 - 2) / 1.2 = 25
  });
});
