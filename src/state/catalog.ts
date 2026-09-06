import { create } from 'zustand';
import { CELESTRAK_MIN_REFRESH_MS, CELESTRAK_ORIGIN, gpUrl, parseGpJson } from '../core/catalog/celestrak';
import { CATALOG_GROUPS, matchesIsraelPreset, matchesQuery } from '../core/catalog/groups';
import { ISI_PRESET } from '../core/catalog/presets';
import { parseTleApiJson, tleApiUrl, type TleRecord } from '../core/catalog/tleapi';
import { EROS_LIKE_OMM, syntheticConstellation } from '../core/tle/fixtures';
import { ommToElementSet, tleToElementSet, type ElementSet, type OmmRecord } from '../core/tle/omm';
import snapshot from '../data/isi-snapshot.json';
import { isTauri } from '../platform/env';
import { fetchText, getServerClockOffsetMs } from '../platform/http';
import { getKeyValueStore } from '../platform/kv';
import { getStorage, listStorageKeys } from '../platform/storage';
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
  /** True while refresh() is running. */
  refreshing: boolean;
  /** Problem reported by the catalogue point layer (its web worker), shown in the catalogue panel. */
  workerError: string | null;
  /** How many catalogue points are on the globe versus how many the displayed groups hold. */
  pointStats: { shown: number; total: number; rejected: number } | null;
  /** This machine's clock minus the data server's, ms, once a server answered; null when unknown. */
  clockOffsetMs: number | null;
  groups: Record<string, GroupState>;
  load(options?: { fixture?: boolean }): Promise<void>;
  /** Refresh the ISI element sets. CelesTrak is asked at most once per 2 hours; otherwise the mirror. */
  refresh(): Promise<void>;
  /** Load a group (from cache when fresh). `force` re-fetches a loaded group older than 2 hours. */
  loadGroup(groupId: string, options?: { force?: boolean }): Promise<void>;
  setWorkerError(message: string | null): void;
  setPointStats(stats: CatalogState['pointStats']): void;
  /** Drop downloaded groups and their 2-hour bookkeeping, then reload what is displayed. */
  clearDownloaded(): Promise<void>;
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

/** Age in ms of a fetch timestamp; a timestamp in the future (clock set back) counts as infinitely old. */
export function ageMs(fetchedAt: Date | null, now = Date.now()): number {
  if (!fetchedAt) return Number.POSITIVE_INFINITY;
  const age = now - fetchedAt.getTime();
  return age < 0 ? Number.POSITIVE_INFINITY : age;
}

/** True when `message` describes an answer from the server (as opposed to no connection at all). */
function serverAnswered(message: string): boolean {
  return /^HTTP \d{3}/.test(message) || /CelesTrak returned a web page|Unexpected CelesTrak response|not an array/.test(message);
}

const GROUP_ATTEMPT_PREFIX = 'satloc.group.attempt.';

/** Per-group version of the 2-hour rule: when did CelesTrak last answer a query for this group? */
function groupAttemptAllowed(groupId: string, now = Date.now()): boolean {
  try {
    const last = Number(getStorage().getItem(GROUP_ATTEMPT_PREFIX + groupId) ?? 0);
    return !Number.isFinite(last) || last > now || now - last >= CELESTRAK_MIN_REFRESH_MS;
  } catch {
    return true;
  }
}

function markGroupAttempt(groupId: string, now = Date.now()): void {
  try {
    getStorage().setItem(GROUP_ATTEMPT_PREFIX + groupId, String(now));
  } catch {
    // Best effort.
  }
}

function nextTryLabel(groupId: string): string {
  try {
    const last = Number(getStorage().getItem(GROUP_ATTEMPT_PREFIX + groupId) ?? 0);
    const at = new Date(last + CELESTRAK_MIN_REFRESH_MS);
    return `next try after ${at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return 'next try in 2 hours';
  }
}

/** CelesTrak temporarily blocks clients that repeat a query within 2 hours; remember when we last asked. */
export function celestrakAllowed(now = Date.now()): boolean {
  try {
    const last = Number(getStorage().getItem(CELESTRAK_ATTEMPT_KEY) ?? 0);
    // A timestamp in the future (clock set back) must not lock CelesTrak out; treat it as no attempt.
    return !Number.isFinite(last) || last > now || now - last >= CELESTRAK_MIN_REFRESH_MS;
  } catch {
    return true;
  }
}

/** Shape check for catalogue data read back from a cache; bad entries are treated as absent. */
function isStoredCatalog(value: unknown): value is StoredCatalog {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StoredCatalog>;
  if (!Array.isArray(v.records)) return false;
  if (v.fetchedAt !== null && (typeof v.fetchedAt !== 'string' || !Number.isFinite(new Date(v.fetchedAt).getTime()))) return false;
  if (!v.records.every((r) => r && typeof r === 'object' && Number.isFinite((r as OmmRecord).NORAD_CAT_ID) && typeof (r as OmmRecord).EPOCH === 'string')) return false;
  if (v.tles !== undefined) {
    if (!Array.isArray(v.tles)) return false;
    if (!v.tles.every((t) => t && typeof t === 'object' && Number.isFinite((t as TleRecord).noradId) && typeof (t as TleRecord).line1 === 'string' && typeof (t as TleRecord).line2 === 'string')) return false;
  }
  return true;
}

/** Element sets known before any refresh: the newer of the bundled snapshot and this device's cache. */
function currentStored(): { stored: StoredCatalog; source: CatalogSource; fetchedAt: Date | null } {
  let stored: StoredCatalog = snapshot as StoredCatalog;
  let source: CatalogSource = stored.records.length + (stored.tles?.length ?? 0) > 0 ? 'snapshot' : 'none';
  let fetchedAt = stored.fetchedAt ? new Date(stored.fetchedAt) : null;
  const cache = readCache();
  if (cache && cache.fetchedAt && (!fetchedAt || new Date(cache.fetchedAt) > fetchedAt)) {
    stored = cache;
    source = cache.source ?? 'cache';
    fetchedAt = new Date(cache.fetchedAt);
  }
  return { stored, source, fetchedAt };
}

const KNOWN_GROUP_IDS = new Set([ISRAEL_GROUP_ID, ...CATALOG_GROUPS.map((g) => g.id)]);

/** Group loads in flight, so concurrent callers (and the Israel filter) share one fetch. */
const inflightGroups = new Map<string, Promise<void>>();

/** Refresh interval for the background scheduler (the 2-hour rule decides whether anything is fetched). */
const AUTO_REFRESH_TICK_MS = 15 * 60 * 1000;

/**
 * Keep element sets fresh while the app runs: every 15 minutes, refresh the ISI sets once they are
 * 2 hours old and re-fetch displayed groups older than 2 hours. Returns a stop function.
 */
export function startAutoRefresh(): () => void {
  const tick = () => {
    const state = useCatalog.getState();
    if (state.source === 'fixture' || state.refreshing) return;
    if (ageMs(state.fetchedAt) >= CELESTRAK_MIN_REFRESH_MS) void state.refresh();
    for (const groupId of useSettings.getState().displayedGroups) {
      if (KNOWN_GROUP_IDS.has(groupId)) void state.loadGroup(groupId, { force: true });
    }
  };
  const timer = setInterval(tick, AUTO_REFRESH_TICK_MS);
  return () => clearInterval(timer);
}

function markCelestrakAttempt(now = Date.now()): void {
  try {
    getStorage().setItem(CELESTRAK_ATTEMPT_KEY, String(now));
  } catch {
    // Best effort.
  }
}

/** Turn an HTTP failure into a sentence a user can act on. */
export function describeCelestrakFailure(message: string, subject = 'this satellite'): string {
  if (/HTTP 403/.test(message)) return 'CelesTrak refused the request (HTTP 403, its temporary block for repeated queries)';
  if (/HTTP 404/.test(message)) return `CelesTrak had no record for ${subject} (HTTP 404)`;
  const serverError = /HTTP 5\d\d/.exec(message);
  if (serverError) return `CelesTrak is having trouble (${serverError[0]})`;
  // Browser fetch, the Tauri http plugin (reqwest) and our own timeout word this differently.
  if (/Failed to fetch|fetch failed|network|timed? ?out|error sending request|dns|ENOTFOUND|ECONN|connect/i.test(message)) {
    return 'CelesTrak could not be reached';
  }
  if (/web page instead of data/.test(message)) return message;
  return `CelesTrak failed (${message})`;
}

function celestrakOrigin(): string {
  // Browser dev mode goes through the Vite proxy; Tauri and production builds talk to CelesTrak.
  return !isTauri() && import.meta.env.DEV ? '/api/celestrak' : CELESTRAK_ORIGIN;
}

/**
 * Element sets per catalogue record, built on first use and memoised per record object: a
 * 12,000-record group costs nothing until something is looked up in it.
 */
const recordSets = new WeakMap<OmmRecord, ElementSet | null>();

export function recordToSet(record: OmmRecord): ElementSet | undefined {
  const cached = recordSets.get(record);
  if (cached !== undefined) return cached ?? undefined;
  let set: ElementSet | null;
  try {
    set = ommToElementSet(record);
  } catch {
    set = null;
  }
  recordSets.set(record, set);
  return set ?? undefined;
}

function recordsToSets(records: OmmRecord[], tles: TleRecord[] = []): Map<number, ElementSet> {
  const byId = new Map<number, ElementSet>();
  const skipped: string[] = [];
  for (const record of records) {
    const set = recordToSet(record);
    if (set) byId.set(set.noradId, set);
    else skipped.push(record.OBJECT_NAME);
  }
  for (const tle of tles) {
    if (byId.has(tle.noradId)) continue;
    try {
      byId.set(tle.noradId, tleToElementSet(tle.line1, tle.line2, tle.name));
    } catch {
      skipped.push(tle.name);
    }
  }
  if (skipped.length > 0) {
    console.warn(`Skipped ${skipped.length} unusable element set(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''}`);
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

/** Epoch of an OMM record or a TLE record, or null when it cannot be parsed. */
function elementEpoch(entry: OmmRecord | TleRecord): Date | null {
  try {
    const set = 'EPOCH' in entry ? ommToElementSet(entry) : tleToElementSet(entry.line1, entry.line2, entry.name);
    return set.epoch;
  } catch {
    return null;
  }
}

/** Fresh group records replace the frozen copies stored for pinned satellites when they are newer. */
function syncFavoritesWith(records: OmmRecord[]): void {
  const settings = useSettings.getState();
  if (settings.favorites.length === 0) return;
  const byId = new Map(records.map((r) => [r.NORAD_CAT_ID, r]));
  for (const favorite of settings.favorites) {
    const fresh = byId.get(favorite.noradId);
    if (!fresh) continue;
    const current = 'omm' in favorite.record ? favorite.record.omm : favorite.record.tle;
    const currentEpoch = elementEpoch(current);
    const freshEpoch = elementEpoch(fresh);
    if (!freshEpoch || (currentEpoch && freshEpoch.getTime() <= currentEpoch.getTime())) continue;
    settings.updateFavorite({ noradId: favorite.noradId, name: fresh.OBJECT_NAME.trim() || favorite.name, record: { omm: fresh } });
  }
}

/** Element sets built from favourites, keyed by the favourite object (stable across store updates). */
const favoriteSets = new WeakMap<Favorite, ElementSet | undefined>();

/** Memoised per favourite object: callers get the same ElementSet each time, so memos downstream hold. */
export function favoriteToSet(favorite: Favorite): ElementSet | undefined {
  if (favoriteSets.has(favorite)) return favoriteSets.get(favorite);
  let set: ElementSet | undefined;
  try {
    set =
      'omm' in favorite.record
        ? ommToElementSet(favorite.record.omm)
        : tleToElementSet(favorite.record.tle.line1, favorite.record.tle.line2, favorite.record.tle.name);
  } catch {
    set = undefined;
  }
  favoriteSets.set(favorite, set);
  return set;
}

function readCache(): StoredCatalog | null {
  try {
    const raw = getStorage().getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredCatalog(parsed) && typeof parsed.fetchedAt === 'string' ? parsed : null;
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

type GetState = () => CatalogState;
type SetState = (partial: Partial<CatalogState> | ((state: CatalogState) => Partial<CatalogState>)) => void;

async function loadGroupImpl(
  groupId: string,
  options: { force?: boolean },
  existing: GroupState | undefined,
  get: GetState,
  set: SetState,
): Promise<void> {
  const publish = (records: OmmRecord[], fetchedAt: Date | null, status: GroupState['status'], error: string | null) => {
    if (status === 'ready' && records.length > 0 && (!existing || records !== existing.records)) syncFavoritesWith(records);
    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          id: groupId,
          ...groupMeta(groupId),
          status,
          error,
          fetchedAt,
          records,
        },
      },
    }));
  };

  // The Israel preset is a filter over the full active catalogue and waits for it to actually load.
  if (groupId === ISRAEL_GROUP_ID) {
    if (!existing || existing.records.length === 0) publish([], null, 'loading', null);
    await get().loadGroup('active', options);
    const active = get().groups['active'];
    const records = active?.records.filter((r) => matchesIsraelPreset(r.OBJECT_NAME)) ?? [];
    const ok = active?.status === 'ready';
    publish(records, active?.fetchedAt ?? null, ok ? 'ready' : 'error', ok ? active?.error ?? null : (active?.error ?? 'The active catalogue could not be loaded'));
    return;
  }

  // Mark as loading right away (synchronously for callers) unless we already show records.
  if (!existing || existing.records.length === 0) publish([], null, 'loading', null);

  const kv = getKeyValueStore();
  const cacheKey = GROUP_CACHE_PREFIX + groupId;
  const cachedRaw = await kv.get<unknown>(cacheKey).catch(() => undefined);
  let cached: StoredCatalog | null = null;
  if (cachedRaw !== undefined) {
    if (isStoredCatalog(cachedRaw) && typeof cachedRaw.fetchedAt === 'string') cached = cachedRaw;
    else void kv.delete(cacheKey).catch(() => undefined);
  }
  const cachedAt = cached ? new Date(cached.fetchedAt as string) : null;
  if (cached && cachedAt && (!existing || existing.records.length === 0)) publish(cached.records, cachedAt, 'ready', null);

  if (ageMs(cachedAt) < CELESTRAK_MIN_REFRESH_MS) return;

  const fallback = existing && existing.records.length > 0 ? existing : cached && cachedAt ? { records: cached.records, fetchedAt: cachedAt } : null;
  // CelesTrak blocks clients that repeat a query within 2 hours, and a failed answer counts too:
  // do not let the 15-minute tick (or a checkbox toggle) turn one 403 into a lasting block.
  if (!groupAttemptAllowed(groupId)) {
    const message = `CelesTrak was asked for this group less than 2 hours ago (${nextTryLabel(groupId)})`;
    if (fallback) publish(fallback.records, fallback.fetchedAt, 'ready', existing?.error ?? message);
    else publish([], null, 'error', message);
    return;
  }

  try {
    let text: string;
    try {
      text = await fetchText(gpUrl({ group: groupId }, celestrakOrigin()), { timeoutMs: 60_000 });
      markGroupAttempt(groupId);
    } catch (err) {
      if (serverAnswered(err instanceof Error ? err.message : String(err))) markGroupAttempt(groupId);
      throw err;
    }
    const records = parseGpJson(text);
    const fetchedAt = new Date();
    let saveError: string | null = null;
    await kv.set(cacheKey, { fetchedAt: fetchedAt.toISOString(), records } satisfies StoredCatalog).catch((err: unknown) => {
      console.warn(`Could not cache group ${groupId}`, err);
      saveError = 'Could not save this group for offline use (storage full or unavailable); it will be downloaded again next time';
    });
    publish(records, fetchedAt, 'ready', saveError);
  } catch (err) {
    const message = describeCelestrakFailure(err instanceof Error ? err.message : String(err), 'this group');
    console.warn(`Group ${groupId} failed`, err);
    if (fallback) publish(fallback.records, fallback.fetchedAt, 'ready', message);
    else publish([], null, 'error', message);
  }
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  sets: [],
  source: 'none',
  fetchedAt: null,
  status: 'idle',
  error: null,
  notice: null,
  refreshing: false,
  workerError: null,
  pointStats: null,
  clockOffsetMs: null,
  groups: {},

  setWorkerError(message) {
    set({ workerError: message });
  },

  setPointStats(stats) {
    set({ pointStats: stats });
  },

  async clearDownloaded() {
    await getKeyValueStore().clear().catch((err: unknown) => console.warn('Could not clear the group cache', err));
    for (const key of listStorageKeys()) if (key.startsWith(GROUP_ATTEMPT_PREFIX)) getStorage().removeItem(key);
    set({ groups: {}, pointStats: null });
    for (const groupId of useSettings.getState().displayedGroups) void get().loadGroup(groupId);
  },

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
          },
        },
      });
      return;
    }

    // 1. Bundled snapshot, then 2. anything newer we cached on this device.
    const { stored, source, fetchedAt } = currentStored();
    const sets = toPresetSets(stored.records, stored.tles ?? []);
    set({ sets, source, fetchedAt, status: sets.length > 0 ? 'ready' : 'loading', error: null });

    // 3. Groups the user left displayed last time (unknown ids, e.g. from a test build, are dropped).
    for (const groupId of useSettings.getState().displayedGroups) {
      if (KNOWN_GROUP_IDS.has(groupId)) void get().loadGroup(groupId);
      else useSettings.getState().setGroupDisplayed(groupId, false);
    }

    // 4. Refresh from CelesTrak unless the data is fresh enough.
    if (ageMs(fetchedAt) >= CELESTRAK_MIN_REFRESH_MS) await get().refresh();
  },

  async refresh() {
    if (get().refreshing || get().source === 'fixture') return;
    set({ refreshing: true });
    try {
      const origin = celestrakOrigin();
      const askCelestrak = celestrakAllowed();

      // Start from what we already have, so a satellite whose fetch fails keeps its last elements.
      const { stored } = currentStored();
      const records = new Map<number, OmmRecord>(stored.records.map((r) => [r.NORAD_CAT_ID, r]));
      const tles = new Map<number, TleRecord>((stored.tles ?? []).map((t) => [t.noradId, t]));
      const problems: string[] = [];
      let usedMirror = false;
      let fetchedAny = false;
      for (const sat of ISI_PRESET.satellites) {
        if (askCelestrak) {
          try {
            let text: string;
            try {
              text = await fetchText(gpUrl({ catnr: sat.noradId }, origin));
              markCelestrakAttempt(); // CelesTrak saw this query: the 2-hour clock starts now
            } catch (err) {
              // Offline or DNS failure: CelesTrak never saw the query, so do not burn the 2-hour slot.
              if (serverAnswered(err instanceof Error ? err.message : String(err))) markCelestrakAttempt();
              throw err;
            }
            const found = parseGpJson(text).find((r) => r.NORAD_CAT_ID === sat.noradId);
            if (found) {
              records.set(sat.noradId, found);
              tles.delete(sat.noradId); // the fresh OMM record supersedes any older mirror TLE
              fetchedAny = true;
              continue;
            }
            problems.push(`${sat.name}: not in the CelesTrak response`);
          } catch (err) {
            problems.push(`${sat.name}: ${describeCelestrakFailure(err instanceof Error ? err.message : String(err))}`);
          }
        }
        // Fallback (or the only source inside CelesTrak's 2-hour window): the TLE mirror.
        try {
          const tle = parseTleApiJson(await fetchText(tleApiUrl(sat.noradId)), sat.noradId);
          // The mirror lags CelesTrak: never replace newer elements with older ones.
          const have = records.get(sat.noradId) ?? tles.get(sat.noradId);
          const haveEpoch = have ? elementEpoch(have) : null;
          const tleEpoch = elementEpoch(tle);
          if (haveEpoch && tleEpoch && tleEpoch.getTime() <= haveEpoch.getTime()) {
            problems.push(`${sat.name}: the mirror has nothing newer than what we have`);
            fetchedAny = true; // the data is confirmed current, so the refresh did not fail
          } else {
            tles.set(sat.noradId, tle);
            records.delete(sat.noradId); // the fresh TLE supersedes any older OMM record
            usedMirror = true;
            fetchedAny = true;
          }
        } catch (err) {
          problems.push(`${sat.name} (mirror): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!fetchedAny) {
        throw new Error(problems.join('; ') || 'no element sets returned');
      }
      const fetchedAt = new Date();
      const source: 'celestrak' | 'mirror' = usedMirror ? 'mirror' : 'celestrak';
      const next: StoredCatalog = { fetchedAt: fetchedAt.toISOString(), records: [...records.values()], tles: [...tles.values()], source };
      writeCache(next);
      const notice = !askCelestrak
        ? 'CelesTrak is asked at most once every 2 hours; this refresh used the mirror.'
        : problems.length > 0
          ? `${problems.join('; ')}; using the mirror.`
          : null;
      set({ sets: toPresetSets(next.records, next.tles ?? []), source, fetchedAt, status: 'ready', error: null, notice });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('Element set refresh failed', err);
      set((state) => ({ error: message, notice: null, status: state.sets.length > 0 ? 'ready' : 'error' }));
    } finally {
      const serverOffset = getServerClockOffsetMs();
      set({ refreshing: false, clockOffsetMs: serverOffset === null ? get().clockOffsetMs : -serverOffset });
    }
  },

  loadGroup(groupId, options = {}) {
    const running = inflightGroups.get(groupId);
    if (running) return running;
    const existing = get().groups[groupId];
    if (existing && existing.status === 'ready') {
      if (!options.force) return Promise.resolve();
      if (ageMs(existing.fetchedAt) < CELESTRAK_MIN_REFRESH_MS) return Promise.resolve();
    }
    const task = loadGroupImpl(groupId, options, existing, get, set).finally(() => inflightGroups.delete(groupId));
    inflightGroups.set(groupId, task);
    return task;
  },

  findSet(noradId) {
    const state = get();
    const isi = state.sets.find((s) => s.noradId === noradId);
    if (isi) return isi;
    // Loaded groups first: they are refreshed, a favourite is the copy taken when it was pinned.
    for (const group of Object.values(state.groups)) {
      const record = group.records.find((r) => r.NORAD_CAT_ID === noradId);
      if (record) {
        const set = recordToSet(record);
        if (set) return set;
      }
    }
    const favorite = useSettings.getState().favorites.find((f) => f.noradId === noradId);
    return favorite ? favoriteToSet(favorite) : undefined;
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
    // Match on the raw records (name and id) and build element sets only for the hits.
    for (const group of Object.values(state.groups)) {
      for (const r of group.records) {
        if (results.length >= limit) break;
        if (seen.has(r.NORAD_CAT_ID) || !matchesQuery(query, r.OBJECT_NAME, r.NORAD_CAT_ID)) continue;
        const set = recordToSet(r);
        if (set) consider(set);
      }
    }
    for (const f of useSettings.getState().favorites) {
      const set = favoriteToSet(f);
      if (set) consider(set);
    }
    return results;
  },
}));
