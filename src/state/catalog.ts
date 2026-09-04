import { create } from 'zustand';
import { CELESTRAK_MIN_REFRESH_MS, CELESTRAK_ORIGIN, gpUrl, parseGpJson } from '../core/catalog/celestrak';
import { ISI_PRESET } from '../core/catalog/presets';
import { EROS_LIKE_OMM } from '../core/tle/fixtures';
import { ommToElementSet, type ElementSet, type OmmRecord } from '../core/tle/omm';
import snapshot from '../data/isi-snapshot.json';
import { isTauri } from '../platform/env';
import { fetchText } from '../platform/http';
import { getStorage } from '../platform/storage';

export type CatalogSource = 'none' | 'fixture' | 'snapshot' | 'cache' | 'celestrak';

interface CachedCatalog {
  fetchedAt: string;
  records: OmmRecord[];
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

function toElementSets(records: OmmRecord[]): ElementSet[] {
  const byId = new Map<number, ElementSet>();
  for (const record of records) {
    try {
      const set = ommToElementSet(record);
      byId.set(set.noradId, set);
    } catch (err) {
      console.warn('Skipping element set', record.OBJECT_NAME, err);
    }
  }
  const ordered: ElementSet[] = [];
  for (const sat of ISI_PRESET.satellites) {
    const set = byId.get(sat.noradId);
    if (set) {
      ordered.push({ ...set, name: sat.name });
      byId.delete(sat.noradId);
    }
  }
  return [...ordered, ...byId.values()];
}

function readCache(): CachedCatalog | null {
  try {
    const raw = getStorage().getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    return Array.isArray(parsed.records) && typeof parsed.fetchedAt === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(cache: CachedCatalog): void {
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
      set({ sets: toElementSets([EROS_LIKE_OMM]), source: 'fixture', fetchedAt: new Date(), status: 'ready', error: null });
      return;
    }

    // 1. Bundled snapshot, then 2. anything newer we cached on this device.
    let records = snapshot.records as OmmRecord[];
    let source: CatalogSource = records.length > 0 ? 'snapshot' : 'none';
    let fetchedAt = snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : null;

    const cache = readCache();
    if (cache && (!fetchedAt || new Date(cache.fetchedAt) > fetchedAt)) {
      records = cache.records;
      source = 'cache';
      fetchedAt = new Date(cache.fetchedAt);
    }

    set({
      sets: toElementSets(records),
      source,
      fetchedAt,
      status: records.length > 0 ? 'ready' : 'loading',
      error: null,
    });

    // 3. Refresh from CelesTrak unless the data is fresh enough.
    const age = fetchedAt ? Date.now() - fetchedAt.getTime() : Number.POSITIVE_INFINITY;
    if (age >= CELESTRAK_MIN_REFRESH_MS) await get().refresh();
  },

  async refresh() {
    const origin = celestrakOrigin();
    try {
      const results = await Promise.all(
        ISI_PRESET.satellites.map((sat) => fetchText(gpUrl({ catnr: sat.noradId }, origin))),
      );
      const records = results.flatMap(parseGpJson);
      if (records.length === 0) throw new Error('CelesTrak returned no element sets for the ISI satellites');
      const fetchedAt = new Date();
      writeCache({ fetchedAt: fetchedAt.toISOString(), records });
      set({ sets: toElementSets(records), source: 'celestrak', fetchedAt, status: 'ready', error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('CelesTrak refresh failed', err);
      set((state) => ({ error: message, status: state.sets.length > 0 ? 'ready' : 'error' }));
    }
  },
}));
