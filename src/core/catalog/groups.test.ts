import { describe, expect, it } from 'vitest';
import { syntheticConstellation } from '../tle/fixtures';
import { ommToElementSet } from '../tle/omm';
import { CATALOG_GROUPS, matchesIsraelPreset, matchesQuery } from './groups';

describe('catalog groups', () => {
  it('has unique CelesTrak group ids', () => {
    const ids = CATALOG_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches Israeli satellite names', () => {
    expect(matchesIsraelPreset('OFEQ 13')).toBe(true);
    expect(matchesIsraelPreset('Amos-17')).toBe(true);
    expect(matchesIsraelPreset('EROS C3')).toBe(true);
    expect(matchesIsraelPreset('STARLINK-1234')).toBe(false);
    expect(matchesIsraelPreset('HORIZONS 3E')).toBe(false);
  });

  it('searches by name fragment or catalogue-number prefix', () => {
    expect(matchesQuery('eros', 'EROS C3', 54880)).toBe(true);
    expect(matchesQuery('548', 'EROS C3', 54880)).toBe(true);
    expect(matchesQuery('549', 'EROS C3', 54880)).toBe(false);
    expect(matchesQuery('13', 'OFEQ 13', 44069)).toBe(true);
    expect(matchesQuery('', 'EROS C3', 54880)).toBe(false);
  });
});

describe('syntheticConstellation', () => {
  it('produces distinct, propagatable element sets', () => {
    const records = syntheticConstellation(40);
    expect(records).toHaveLength(40);
    expect(new Set(records.map((r) => r.NORAD_CAT_ID)).size).toBe(40);
    for (const r of records) expect(ommToElementSet(r).satrec.error).toBe(0);
  });
});
