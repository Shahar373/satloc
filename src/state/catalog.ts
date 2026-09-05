import { create } from 'zustand';
import { CELESTRAK_MIN_REFRESH_MS, CELESTRAK_ORIGIN, gpUrl, parseGpJson } from '../core/catalog/celestrak';
import { ISI_PRESET } from '../core/catalog/presets';
import { parseTleApiJson, tleApiUrl, type TleRecord } from '../core/catalog/tleapi';
import { EROS_LIKE_OMM } from '../core/tle/fixtures';
import { ommToElementSet, tleToElementSet, type ElementSet, type OmmRecord } from '../core/tle/omm';
import snapshot from '../data/isi-snapshot.json';
import { isTauri } from '../platform/env';
import { fetchText } from '../platform/http';
import { getStorage } from '../platform/storage';

export type CatalogSource = 'none' | 'fixture' | 'snapshot' | 'cache' | 'celestrak';

/** Element sets as stored on disk: OMM records from CelesTrak and/or TLE lines from the mirror. */
interface StoredCatalog {
  fetchedAt: string | null;
  records: OmmRecord[];
  tles?: TleRecord[];
}

export interface CatalogState {
  /** Element sets in preset order. */
  sets: ElementSet[];
  source: CatalogSource;
  fetchedAt: Date | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Last refresh problem, kept even when older data is still shown. */
  error: string | null;
  load(options?: { fixture?: boolean }): Promise<void>;
  refresh(): Promise<void>;
}

const CACHE_KEY = 'satloc.catalog.isi';

function celestrakOrigin(): string {
  // Browser dev mode goes through the Vite proxy; Tauri and production builds talk to CelesTrak.
  return !isTauri() && import.meta.env.DEV ? '/api/celestrak' : CELESTRAK_ORIGIN;
}

function toElementSets(records: OmmRecord[], tles: TleRecord[] = []): ElementSet[] {
  const byId = new Map<number, ElementSet>();
  for (const record of records) {
    try {
      const set = ommToElementSet(record);
      byId.set(set.noradId, set);
    } catch (err) {
      console.warn('Skipping element set', record.OBJECT_NAME, err);
    }
  }
  for (const tle of tles) {
    if (byId.has(tle.noradId)) continue;
    try {
      byId.set(tle.noradId, tleToElementSet(tle.line1, tle.line2, tle.name));
    } catch (err) {
      console.warn('Skipping TLE', tle.name, err);
    }
  }
  // Preset order; anything else (e.g. a decayed satellite still present in an old snapshot) is dropped.
  const ordered: ElementSet[] = [];
  for (const sat of ISI_PRESET.satellites) {
    const set = byId.get(sat.noradId);
    if (set) ordered.push({ ...set, name: sat.name });
  }
  return ordered;
}

function readCache(): StoredCatalog | null {
  try {
    const raw = getStorage().getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCatalog;
    return Array.isArray(parsed.records) && typeof parsed.fetchedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cache: StoredCatalog): void {
  try {
    getStorage().setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Best effort.
  }
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  sets: [],
  source: 'none',
  fetchedAt: null,
  status: 'idle',
  error: null,

  async load(options = {}) {
    if (options.fixture) {
      // Synthetic element set for tests; bypasses the preset filter on purpose.
      set({ sets: [ommToElementSet(EROS_LIKE_OMM)], source: 'fixture', fetchedAt: new Date(), status: 'ready', error: null });
      return;
    }

    // 1. Bundled snapshot, then 2. anything newer we cached on this device.
    let stored: StoredCatalog = snapshot as StoredCatalog;
    let source: CatalogSource = stored.records.length + (stored.tles?.length ?? 0) > 0 ? 'snapshot' : 'none';
    let fetchedAt = stored.fetchedAt ? new Date(stored.fetchedAt) : null;

    const cache = readCache();
    if (cache && cache.fetchedAt && (!fetchedAt || new Date(cache.fetchedAt) > fetchedAt)) {
      stored = cache;
      source = 'cache';
      fetchedAt = new Date(cache.fetchedAt);
    }

    const sets = toElementSets(stored.records, stored.tles ?? []);
    set({ sets, source, fetchedAt, status: sets.length > 0 ? 'ready' : 'loading', error: null });

    // 3. Refresh from CelesTrak unless the data is fresh enough.
    const age = fetchedAt ? Date.now() - fetchedAt.getTime() : Number.POSITIVE_INFINITY;
    if (age >= CELESTRAK_MIN_REFRESH_MS) await get().refresh();
  },

  async refresh() {
    const origin = celestrakOrigin();
    try {
      const records: OmmRecord[] = [];
      const tles: TleRecord[] = [];
      const problems: string[] = [];
      for (const sat of ISI_PRESET.satellites) {
        try {
          const found = parseGpJson(await fetchText(gpUrl({ catnr: sat.noradId }, origin))).find(
            (r) => r.NORAD_CAT_ID === sat.noradId,
          );
          if (found) {
            records.push(found);
            continue;
          }
          problems.push(`${sat.name}: not in CelesTrak response`);
        } catch (err) {
          problems.push(`${sat.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Fallback: the TLE mirror.
        try {
          tles.push(parseTleApiJson(await fetchText(tleApiUrl(sat.noradId)), sat.noradId));
        } catch (err) {
          problems.push(`${sat.name} (mirror): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (records.length + tles.length === 0) {
        throw new Error(problems.join('; ') || 'no element sets returned');
      }
      const fetchedAt = new Date();
      writeCache({ fetchedAt: fetchedAt.toISOString(), records, tles });
      set({
        sets: toElementSets(records, tles),
        source: 'celestrak',
        fetchedAt,
        status: 'ready',
        error: problems.length > 0 ? problems.join('; ') : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('CelesTrak refresh failed', err);
      set((state) => ({ error: message, status: state.sets.length > 0 ? 'ready' : 'error' }));
    }
  },
}));
