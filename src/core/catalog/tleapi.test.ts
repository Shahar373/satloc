import { describe, expect, it } from 'vitest';
import { parseTleApiJson, tleApiUrl } from './tleapi';

describe('tleapi', () => {
  it('builds the mirror URL', () => {
    expect(tleApiUrl(29079)).toBe('https://tle.ivanstanojevic.me/api/tle/29079');
  });

  it('parses a mirror response', () => {
    const rec = parseTleApiJson('{"name":"EROS B","satelliteId":29079,"line1":"1 29079U ...","line2":"2 29079 ..."}', 29079);
    expect(rec).toEqual({ noradId: 29079, name: 'EROS B', line1: '1 29079U ...', line2: '2 29079 ...' });
  });

  it('rejects an answer for another satellite', () => {
    expect(() => parseTleApiJson('{"name":"X","line1":"1 25544U ...","line2":"2 25544 ..."}', 29079)).toThrow(/25544 instead of 29079/);
    expect(() => parseTleApiJson('{"name":"X","satelliteId":1,"line1":"1 29079U ...","line2":"2 29079 ..."}', 29079)).toThrow(/instead of 29079/);
  });

  it('rejects responses without TLE lines', () => {
    expect(() => parseTleApiJson('{"error":"not found"}', 1)).toThrow(/no TLE lines/);
  });
});
