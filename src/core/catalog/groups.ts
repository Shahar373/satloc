/** CelesTrak GP groups we expose. Ids are CelesTrak's `GROUP=` values. */
export interface CatalogGroup {
  id: string;
  name: string;
  /** Rough object count, for the UI before the group is loaded. */
  approxCount: number;
}

export const CATALOG_GROUPS: CatalogGroup[] = [
  { id: 'stations', name: 'Space stations', approxCount: 12 },
  { id: 'visual', name: '100 brightest', approxCount: 160 },
  { id: 'last-30-days', name: 'Launched last 30 days', approxCount: 200 },
  { id: 'resource', name: 'Earth resources', approxCount: 100 },
  { id: 'weather', name: 'Weather', approxCount: 60 },
  { id: 'noaa', name: 'NOAA', approxCount: 20 },
  { id: 'science', name: 'Space & Earth science', approxCount: 100 },
  { id: 'gps-ops', name: 'GPS', approxCount: 32 },
  { id: 'galileo', name: 'Galileo', approxCount: 30 },
  { id: 'glo-ops', name: 'GLONASS', approxCount: 26 },
  { id: 'beidou', name: 'BeiDou', approxCount: 50 },
  { id: 'geo', name: 'Geostationary', approxCount: 600 },
  { id: 'planet', name: 'Planet Labs', approxCount: 200 },
  { id: 'starlink', name: 'Starlink', approxCount: 8000 },
  { id: 'oneweb', name: 'OneWeb', approxCount: 650 },
  { id: 'cubesat', name: 'CubeSats', approxCount: 600 },
  { id: 'active', name: 'All active satellites', approxCount: 12000 },
];

/**
 * Name patterns that identify Israeli satellites in the CelesTrak catalogue (object names are
 * upper-case). Used as a search preset rather than a hard-coded NORAD list.
 */
export const ISRAEL_NAME_PATTERNS = ['OFEQ', 'AMOS', 'TECSAR', 'VENUS', 'DROR', 'EROS', 'DUCHIFAT', 'TAUSAT', 'NSLSAT', 'BGUSAT'];

export function matchesIsraelPreset(objectName: string): boolean {
  const upper = objectName.toUpperCase();
  return ISRAEL_NAME_PATTERNS.some((p) => upper.includes(p));
}

/** Case-insensitive name / catalogue-number search over a list of names. */
export function matchesQuery(query: string, name: string, noradId: number): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (/^\d+$/.test(q) && String(noradId).startsWith(q)) return true;
  return name.toLowerCase().includes(q);
}
