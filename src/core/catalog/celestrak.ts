import type { OmmRecord } from '../tle/omm';

/** CelesTrak GP (general perturbations) endpoint, OMM JSON format. */
export const CELESTRAK_ORIGIN = 'https://celestrak.org';
const GP_PATH = '/NORAD/elements/gp.php';

export type GpQuery = { catnr: number } | { group: string } | { name: string };

/**
 * Build a GP query URL. `origin` lets the browser build go through a same-origin proxy
 * (e.g. `/api/celestrak` in the Vite dev server) while Tauri talks to CelesTrak directly.
 */
export function gpUrl(query: GpQuery, origin = CELESTRAK_ORIGIN): string {
  const params = new URLSearchParams();
  if ('catnr' in query) params.set('CATNR', String(query.catnr));
  else if ('group' in query) params.set('GROUP', query.group);
  else params.set('NAME', query.name);
  params.set('FORMAT', 'json');
  return `${origin}${GP_PATH}?${params.toString()}`;
}

/** CelesTrak answers a query with no matches with a plain-text message rather than an empty array. */
export function parseGpJson(text: string): OmmRecord[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[')) {
    if (/no gp data found/i.test(trimmed)) return [];
    if (trimmed.startsWith('<')) throw new Error('CelesTrak returned a web page instead of data (captive portal or block?)');
    throw new Error(`Unexpected CelesTrak response: ${trimmed.slice(0, 120)}`);
  }
  const data = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(data)) throw new Error('CelesTrak response is not an array');
  return data as OmmRecord[];
}

/** CelesTrak asks not to re-query the same data more often than every 2 hours. */
export const CELESTRAK_MIN_REFRESH_MS = 2 * 60 * 60 * 1000;
