import { describe, expect, it } from 'vitest';
import { ASTERIA_1_GROUND_STATIONS, ASTERIA_1_PROFILE, ASTERIA_1_SCENARIO, ASTERIA_1_TLE } from '../../contracts';
import { downlinkGB } from '../../contracts/domain';
import { predictPasses } from '../passes/predict';
import { tleToElementSet } from '../tle/omm';
import { checkContactCapacity } from './contactCapacity';

// Real pass durations for Asteria-1/GS-Home, discovered via predictPasses over a real 30-day
// search window (see the PR that added this rule for the scratch script that found them):
// a 157.5 s pass (capacityGB ≈ 2.578, room for 2 PAN products but not 3) and a 435.9 s pass
// (capacityGB ≈ 7.799, room for 6).
const SHORT_PASS_DURATION_S = 157.5;
const LONG_PASS_DURATION_S = 435.9;

function panProduct(id: string) {
  return { id, taskId: id, mode: 'PAN' as const, sizeGB: ASTERIA_1_PROFILE.storage.productGB.PAN };
}

describe('checkContactCapacity', () => {
  it('returns null when two PAN products fit the real capacity of a real short pass', () => {
    const finding = checkContactCapacity(ASTERIA_1_PROFILE, {
      contactId: 'contact-short',
      durationS: SHORT_PASS_DURATION_S,
      dataProducts: [panProduct('p1'), panProduct('p2')],
    });
    expect(finding).toBeNull();
  });

  it('flags CONTACT_TOO_SHORT_FOR_PRODUCT when three PAN products exceed that same real pass', () => {
    const finding = checkContactCapacity(ASTERIA_1_PROFILE, {
      contactId: 'contact-short',
      durationS: SHORT_PASS_DURATION_S,
      dataProducts: [panProduct('p1'), panProduct('p2'), panProduct('p3')],
    });
    expect(finding).toMatchObject({
      code: 'CONTACT_TOO_SHORT_FOR_PRODUCT',
      severity: 'HardBlock',
      waivable: false,
      provenance: 'calculated',
      source: 'rules/contact-capacity@1',
    });
    expect(finding?.affectedEntities).toEqual([
      { kind: 'contact', id: 'contact-short' },
      { kind: 'dataProduct', id: 'p1' },
      { kind: 'dataProduct', id: 'p2' },
      { kind: 'dataProduct', id: 'p3' },
    ]);
  });

  it('returns null for the same three products against a real long pass with room to spare', () => {
    const finding = checkContactCapacity(ASTERIA_1_PROFILE, {
      contactId: 'contact-long',
      durationS: LONG_PASS_DURATION_S,
      dataProducts: [panProduct('p1'), panProduct('p2'), panProduct('p3')],
    });
    expect(finding).toBeNull();
  });

  it('is inclusive exactly at capacity', () => {
    const capacityGB = downlinkGB(ASTERIA_1_PROFILE, SHORT_PASS_DURATION_S);
    const finding = checkContactCapacity(ASTERIA_1_PROFILE, {
      contactId: 'contact-short',
      durationS: SHORT_PASS_DURATION_S,
      dataProducts: [{ id: 'exact', taskId: 'exact', mode: 'PAN', sizeGB: capacityGB }],
    });
    expect(finding).toBeNull();
  });

  it('matches real predictPasses output against GS-Home: a mix of passes that can and cannot clear a full 6 GB (5-PAN) load', () => {
    const { satrec } = tleToElementSet(ASTERIA_1_TLE.line1, ASTERIA_1_TLE.line2, ASTERIA_1_TLE.name);
    const station = ASTERIA_1_GROUND_STATIONS.find((s) => s.id === 'gs-home');
    if (!station) throw new Error('Asteria-1 has no gs-home ground station configured');
    const observer = {
      latitude: (station.latitudeDeg * Math.PI) / 180,
      longitude: (station.longitudeDeg * Math.PI) / 180,
      heightKm: 0,
    };
    const passes = predictPasses(satrec, observer, new Date(ASTERIA_1_SCENARIO.startTime), 30 * 24, {
      minElevationDeg: station.minElevationDeg,
    });
    expect(passes.length).toBeGreaterThan(10);

    const fullLoad = [1, 2, 3, 4, 5].map((n) => panProduct(`p${n}`));
    const results = passes.map((pass) =>
      checkContactCapacity(ASTERIA_1_PROFILE, {
        contactId: 'contact-real',
        durationS: pass.durationS,
        dataProducts: fullLoad,
      }),
    );
    // A real 30-day window genuinely produces both outcomes — proves the rule isn't trivially
    // always-pass or always-fail against real Asteria-1/GS-Home geometry.
    expect(results.some((finding) => finding === null)).toBe(true);
    expect(results.some((finding) => finding?.code === 'CONTACT_TOO_SHORT_FOR_PRODUCT')).toBe(true);
  });
});
