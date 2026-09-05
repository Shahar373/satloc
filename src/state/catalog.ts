import { create } from 'zustand';
import { CELESTRAK_MIN_REFRESH_MS, CELESTRAK_ORIGIN, gpUrl, parseGpJson } from '../core/catalog/celestrak';
import { CATALOG_GROUPS, matchesIsraelPreset, matchesQuery } from '../core/catalog/groups';
import { ISI_PRESET } from '../core/catalog/presets';
import { parseTleApiJson, tleApiUrl, type TleRecord } from '../core/catalog/tleapi';
import { EROS_LIKE_OMM, syntheticConstellation } from '../core/tle/fixtures';
import { ommToElementSet, tleToElementSet, type ElementSet, type OmmRecord } from '../core/tle/omm';
import snapshot from '../data/isi-snapshot.json';
import { isTauri } from '../platform/env';
import { fetchText } from '../platform/http';
import { getKeyValueStore } from '../platform/kv';
import { getStorage } from '../platform/storage';
import { useSettings, type Favorite } from './settings';

export type CatalogSource = 'none' | 'fixture' | 'snapshot' | 'cache' | 'celestrak' | 'mirror';

/** Element sets as stored on disk: OMM records from CelesTrak and/or TLE lines from the mirror. */
interface StoredCatalog {
  fetchedAt: string | null;
  records: OmmRecord[];
  tles?: TleRecord[];
  /** 'celestrak' when every set came from CelesTrak, 'mirror' when the mirror supplied any. */
  source?: 'celestrak' | 'mirror';
}

export interface GroupState {
  id: string;
  name: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  fetchedAt: Date | null;
  records: OmmRecord[];
  /** Built lazily from `records`; may be empty while status is not 'ready'. */
  sets: ElementSet[];
}

/** Virtual group: Israeli satellites filtered out of the 'active' group by name. */
export const ISRAEL_GROUP_ID = 'israel';

export interface CatalogState {
  /** ISI element sets in preset order. */
  sets: ElementSet[];
  source: CatalogSource;
  fetchedAt: Date | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Last refresh problem, kept even when older data is still shown. */
  error: string | null;
  /** Explanation when data arrived but not from the preferred source (shown quietly). */
  notice: string | null;
  groups: Record<string, GroupState>;
  load(options?: { fixture?: boolean }): Promise<void>;
  /** Refresh the ISI element sets. CelesTrak is asked at most once per 2 hours; otherwise the mirror. */
  refresh(): Promise<void>;
  loadGroup(groupId: string): Promise<void>;
  /** Find an element set anywhere: ISI, favourites, loaded groups. */
  findSet(noradId: number): ElementSet | undefined;
  /** Raw record for a catalogue satellite, for pinning it as a favourite. */
  findRecord(noradId: number): Favorite['record'] | undefined;
  /** Search ISI sets, favourites and loaded groups. */
  search(query: string, limit?: number): ElementSet[];
}

const CACHE_KEY = 'satloc.catalog.isi';
const CELESTRAK_ATTEMPT_KEY = 'satloc.catalog.isi.celestrakAttempt';
const GROUP_CACHE_PREFIX = 'satloc.group.';

/** CelesTrak temporarily blocks clients that repeat a query within 2 hours; remember when we last asked. */
export function celestrakAllowed(now = Date.now()): boolean {
  try {
    const last = Number(getStorage().getItem(CELESTRAK_ATTEMPT_KEY) ?? 0);
    return !Number.isFinite(last) || now - last >= CELESTRAK_MIN_REFRESH_MS;
  } catch {
    return true;
  }
}

function markCelestrakAttempt(now = Date.now()): void {
  try {
    getStorage().setItem(CELESTRAK_ATTEMPT_KEY, String(now));
  } catch {
    // Best effort.
  }
}

/** Turn an HTTP failure into a sentence a user can act on. */
export function describeCelestrakFailure(message: string): string {
  if (/HTTP 403/.test(message)) return 'CelesTrak refused the request (HTTP 403, its temporary block for repeated queries)';
  if (/HTTP 404/.test(message)) return 'CelesTrak had no record for this satellite (HTTP 404)';
  if (/Failed to fetch|fetch failed|network|timeout/i.test(message)) return 'CelesTrak could not be reached';
  return `CelesTrak failed (${message})`;
}

function celestrakOrigin(): string {
  // Browser dev mode goes through the Vite proxy; Tauri and production builds talk to CelesTrak.
  return !isTauri() && import.meta.env.DEV ? '/api/celestrak' : CELESTRAK_ORIGIN;
}

function recordsToSets(records: OmmRecord[], tles: TleRecord[] = []): Map<number, ElementSet> {
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
  return byId;
}

function toPresetSets(records: OmmRecord[], tles: TleRecord[] = []): ElementSet[] {
  const byId = recordsToSets(records, tles);
  // Preset order; anything else (e.g. a decayed satellite still present in an old snapshot) is dropped.
  const ordered: ElementSet[] = [];
  for (const sat of ISI_PRESET.satellites) {
    const set = byId.get(sat.noradId);
    if (set) ordered.push({ ...set, name: sat.name });
  }
  return ordered;
}

export function favoriteToSet(favorite: Favorite): ElementSet | undefined {
  try {
    return 'omm' in favorite.record
      ? ommToElementSet(favorite.record.omm)
      : tleToElementSet(favorite.record.tle.line1, favorite.record.tle.line2, favorite.record.tle.name);
  } catch {
    return undefined;
  }
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

function groupMeta(groupId: string): { name: string } {
  if (groupId === ISRAEL_GROUP_ID) return { name: 'Israeli satellites' };
  return { name: CATALOG_GROUPS.find((g) => g.id === groupId)?.name ?? groupId };
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  sets: [],
  source: 'none',
  fetchedAt: null,
  status: 'idle',
  error: null,
  notice: null,
  groups: {},

  async load(options = {}) {
    if (options.fixture) {
      // Synthetic element sets for tests; bypass the preset filter on purpose.
      const records = syntheticConstellation(300);
      set({
        sets: [ommToElementSet(EROS_LIKE_OMM)],
        source: 'fixture',
        fetchedAt: new Date(),
        status: 'ready',
        error: null,
        groups: {
          fixture: {
            id: 'fixture',
            name: 'Fixture constellation',
            status: 'ready',
            error: null,
            fetchedAt: new Date(),
            records,
            sets: [...recordsToSets(records).values()],
          },
        },
      });
      return;
    }

    // 1. Bundled snapshot, then 2. anything newer we cached on this device.
    let stored: StoredCatalog = snapshot as StoredCatalog;
    let source: CatalogSource = stored.records.length + (stored.tles?.length ?? 0) > 0 ? 'snapshot' : 'none';
    let fetchedAt = stored.fetchedAt ? new Date(stored.fetchedAt) : null;

    const cache = readCache();
    if (cache && cache.fetchedAt && (!fetchedAt || new Date(cache.fetchedAt) > fetchedAt)) {
      stored = cache;
      source = cache.source ?? 'cache';
      fetchedAt = new Date(cache.fetchedAt);
    }

    const sets = toPresetSets(stored.records, stored.tles ?? []);
    set({ sets, source, fetchedAt, status: sets.length > 0 ? 'ready' : 'loading', error: null });

    // 3. Groups the user left displayed last time.
    for (const groupId of useSettings.getState().displayedGroups) void get().loadGroup(groupId);

    // 4. Refresh from CelesTrak unless the data is fresh enough.
    const age = fetchedAt ? Date.now() - fetchedAt.getTime() : Number.POSITIVE_INFINITY;
    if (age >= CELESTRAK_MIN_REFRESH_MS) await get().refresh();
  },

  async refresh() {
    const origin = celestrakOrigin();
    const askCelestrak = celestrakAllowed();
    if (askCelestrak) markCelestrakAttempt();
    try {
      const records: OmmRecord[] = [];
      const tles: TleRecord[] = [];
      const problems: string[] = [];
      let usedMirror = false;
      for (const sat of ISI_PRESET.satellites) {
        if (askCelestrak) {
          try {
            const found = parseGpJson(await fetchText(gpUrl({ catnr: sat.noradId }, origin))).find(
              (r) => r.NORAD_CAT_ID === sat.noradId,
            );
            if (found) {
              records.push(found);
              continue;
            }
            problems.push(`${sat.name}: not in the CelesTrak response`);
          } catch (err) {
            problems.push(`${sat.name}: ${describeCelestrakFailure(err instanceof Error ? err.message : String(err))}`);
          }
        }
        // Fallback (or the only source inside CelesTrak's 2-hour window): the TLE mirror.
        try {
          tles.push(parseTleApiJson(await fetchText(tleApiUrl(sat.noradId)), sat.noradId));
          usedMirror = true;
        } catch (err) {
          problems.push(`${sat.name} (mirror): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (records.length + tles.length === 0) {
        throw new Error(problems.join('; ') || 'no element sets returned');
      }
      const fetchedAt = new Date();
      const source: 'celestrak' | 'mirror' = usedMirror ? 'mirror' : 'celestrak';
      writeCache({ fetchedAt: fetchedAt.toISOString(), records, tles, source });
      const notice = !askCelestrak
        ? 'CelesTrak is asked at most once every 2 hours; this refresh used the mirror.'
        : problems.length > 0
          ? `${problems.join('; ')}; using the mirror.`
          : null;
      set({ sets: toPresetSets(records, tles), source, fetchedAt, status: 'ready', error: null, notice });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Element set refresh failed', err);
      set((state) => ({ error: message, notice: null, status: state.sets.length > 0 ? 'ready' : 'error' }));
    }
  },

  async loadGroup(groupId) {
    const existing = get().groups[groupId];
    if (existing && (existing.status === 'loading' || existing.status === 'ready')) return;

    // The Israel preset is a filter over the full active catalogue.
    if (groupId === ISRAEL_GROUP_ID) {
      set((s) => ({ groups: { ...s.groups, [groupId]: { id: groupId, ...groupMeta(groupId), status: 'loading', error: null, fetchedAt: null, records: [], sets: [] } } }));
      await get().loadGroup('active');
      const active = get().groups['active'];
      const records = active?.records.filter((r) => matchesIsraelPreset(r.OBJECT_NAME)) ?? [];
      set((s) => ({
        groups: {
          ...s.groups,
          [groupId]: {
            id: groupId,
            ...groupMeta(groupId),
            status: active?.status === 'ready' ? 'ready' : 'error',
            error: active?.error ?? null,
            fetchedAt: active?.fetchedAt ?? null,
            records,
            sets: [...recordsToSets(records).values()],
          },
        },
      }));
      return;
    }

    const kv = getKeyValueStore();
    const cacheKey = GROUP_CACHE_PREFIX + groupId;
    const cached = await kv.get<StoredCatalog>(cacheKey).catch(() => undefined);
    const cachedAt = cached?.fetchedAt ? new Date(cached.fetchedAt) : null;

    const publish = (records: OmmRecord[], fetchedAt: Date | null, status: GroupState['status'], error: string | null) =>
      set((s) => ({
        groups: {
          ...s.groups,
          [groupId]: { id: groupId, ...groupMeta(groupId), status, error, fetchedAt, records, sets: [...recordsToSets(records).values()] },
        },
      }));

    if (cached && cachedAt) publish(cached.records, cachedAt, 'ready', null);
    else publish([], null, 'loading', null);

    const age = cachedAt ? Date.now() - cachedAt.getTime() : Number.POSITIVE_INFINITY;
    if (age < CELESTRAK_MIN_REFRESH_MS) return;

    try {
      const records = parseGpJson(await fetchText(gpUrl({ group: groupId }, celestrakOrigin()), { timeoutMs: 60_000 }));
      const fetchedAt = new Date();
      await kv.set(cacheKey, { fetchedAt: fetchedAt.toISOString(), records } satisfies StoredCatalog).catch(() => undefined);
      publish(records, fetchedAt, 'ready', null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Group ${groupId} failed`, err);
      if (cached && cachedAt) publish(cached.records, cachedAt, 'ready', message);
      else publish([], null, 'error', message);
    }
  },

  findSet(noradId) {
    const state = get();
    const isi = state.sets.find((s) => s.noradId === noradId);
    if (isi) return isi;
    const favorite = useSettings.getState().favorites.find((f) => f.noradId === noradId);
    if (favorite) {
      const set = favoriteToSet(favorite);
      if (set) return set;
    }
    for (const group of Object.values(state.groups)) {
      const found = group.sets.find((s) => s.noradId === noradId);
      if (found) return found;
    }
    return undefined;
  },

  findRecord(noradId) {
    for (const group of Object.values(get().groups)) {
      const omm = group.records.find((r) => r.NORAD_CAT_ID === noradId);
      if (omm) return { omm };
    }
    const favorite = useSettings.getState().favorites.find((f) => f.noradId === noradId);
    return favorite?.record;
  },

  search(query, limit = 30) {
    const state = get();
    const seen = new Set<number>();
    const results: ElementSet[] = [];
    const consider = (s: ElementSet) => {
      if (results.length >= limit || seen.has(s.noradId)) return;
      if (matchesQuery(query, s.name, s.noradId)) {
        seen.add(s.noradId);
        results.push(s);
      }
    };
    state.sets.forEach(consider);
    for (const f of useSettings.getState().favorites) {
      const set = favoriteToSet(f);
      if (set) consider(set);
    }
    for (const group of Object.values(state.groups)) group.sets.forEach(consider);
    return results;
  },
}));
