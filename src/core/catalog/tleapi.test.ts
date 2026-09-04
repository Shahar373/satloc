import { describe, expect, it } from 'vitest';
import { parseTleApiJson, tleApiUrl } from './tleapi';

describe('tleapi', () => {
  it('builds the mirror URL', () => {
    expect(tleApiUrl(29079)).toBe('https://tle.ivanstanojevic.me/api/tle/29079');
  });

  it('parses a mirror response', () => {
    const rec = parseTleApiJson('{"name":"EROS B","line1":"1 ...","line2":"2 ..."}', 29079);
    expect(rec).toEqual({ noradId: 29079, name: 'EROS B', line1: '1 ...', line2: '2 ...' });
  });

  it('rejects responses without TLE lines', () => {
    expect(() => parseTleApiJson('{"error":"not found"}', 1)).toThrow(/no TLE lines/);
  });
});
