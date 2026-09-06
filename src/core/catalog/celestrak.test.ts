import { describe, expect, it } from 'vitest';
import { gpUrl, parseGpJson } from './celestrak';

describe('gpUrl', () => {
  it('builds catalogue-number, group and name queries', () => {
    expect(gpUrl({ catnr: 54880 })).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=54880&FORMAT=json',
    );
    expect(gpUrl({ group: 'active' }, '/api/celestrak')).toBe(
      '/api/celestrak/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    );
    expect(gpUrl({ name: 'EROS' })).toContain('NAME=EROS');
  });
});

describe('parseGpJson', () => {
  it('parses a JSON array', () => {
    const records = parseGpJson('[{"OBJECT_NAME":"EROS C3","NORAD_CAT_ID":54880}]');
    expect(records).toHaveLength(1);
    expect(records[0]!.NORAD_CAT_ID).toBe(54880);
  });

  it('treats the "No GP data found" text as an empty result', () => {
    expect(parseGpJson('No GP data found')).toEqual([]);
  });

  it('rejects other non-JSON bodies', () => {
    expect(() => parseGpJson('rate limited')).toThrow(/Unexpected CelesTrak response/);
    expect(() => parseGpJson('<html>rate limited</html>')).toThrow(/web page instead of data/);
  });
});

describe('parseGpJson with non-JSON bodies', () => {
  it('does not echo HTML back to the user', () => {
    expect(() => parseGpJson('<!DOCTYPE html><html><body>blocked</body></html>')).toThrow(/web page instead of data/);
  });
});
