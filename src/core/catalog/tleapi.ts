/**
 * Fallback orbital-data source: the public TLE API mirror at tle.ivanstanojevic.me, which
 * republishes CelesTrak data as JSON `{ name, line1, line2 }` per catalogue number.
 */
export const TLE_API_ORIGIN = 'https://tle.ivanstanojevic.me';

export interface TleRecord {
  noradId: number;
  name: string;
  line1: string;
  line2: string;
}

export function tleApiUrl(noradId: number, origin = TLE_API_ORIGIN): string {
  return `${origin}/api/tle/${noradId}`;
}

export function parseTleApiJson(text: string, noradId: number): TleRecord {
  const data = JSON.parse(text) as { name?: unknown; line1?: unknown; line2?: unknown };
  if (typeof data.line1 !== 'string' || typeof data.line2 !== 'string') {
    throw new Error(`TLE API response for ${noradId} has no TLE lines`);
  }
  return {
    noradId,
    name: typeof data.name === 'string' ? data.name : `NORAD ${noradId}`,
    line1: data.line1,
    line2: data.line2,
  };
}
