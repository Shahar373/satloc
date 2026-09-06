import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TleRecord } from '../core/catalog/tleapi';
import type { OmmRecord } from '../core/tle/omm';
import { getStorage } from '../platform/storage';
import type { ImagerySource } from '../viewer/imagery';

/** A satellite the user pinned from the catalogue; its element set is kept so it shows without the group. */
export interface Favorite {
  noradId: number;
  name: string;
  record: { omm: OmmRecord } | { tle: TleRecord };
}

export interface SettingsState {
  /** Which base imagery to use. 'auto' probes the network and falls back to the bundled offline tiles. */
  imagery: ImagerySource;
  /** Cesium Ion access token (optional; unlocks Bing imagery and world terrain). */
  ionToken: string;
  /** Catalogue groups drawn as points. */
  displayedGroups: string[];
  /** Upper bound on catalogue points drawn at once (performance guard, lower on phones). */
  maxCatalogPoints: number;
  favorites: Favorite[];
  setImagery(imagery: ImagerySource): void;
  setIonToken(token: string): void;
  setGroupDisplayed(groupId: string, displayed: boolean): void;
  setMaxCatalogPoints(n: number): void;
  addFavorite(favorite: Favorite): void;
  /** Replace a pinned satellite's stored copy in place (order preserved); no-op when it is not pinned. */
  updateFavorite(favorite: Favorite): void;
  removeFavorite(noradId: number): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      imagery: 'auto',
      ionToken: '',
      displayedGroups: [],
      maxCatalogPoints: 12_000,
      favorites: [],
      setImagery: (imagery) => set({ imagery }),
      setIonToken: (ionToken) => set({ ionToken: ionToken.trim() }),
      setGroupDisplayed: (groupId, displayed) =>
        set((s) => ({
          displayedGroups: displayed
            ? [...new Set([...s.displayedGroups, groupId])]
            : s.displayedGroups.filter((g) => g !== groupId),
        })),
      setMaxCatalogPoints: (maxCatalogPoints) => set({ maxCatalogPoints }),
      addFavorite: (favorite) =>
        set((s) => ({ favorites: [...s.favorites.filter((f) => f.noradId !== favorite.noradId), favorite] })),
      updateFavorite: (favorite) =>
        set((s) => ({ favorites: s.favorites.map((f) => (f.noradId === favorite.noradId ? favorite : f)) })),
      removeFavorite: (noradId) => set((s) => ({ favorites: s.favorites.filter((f) => f.noradId !== noradId) })),
    }),
    {
      name: 'satloc.settings',
      version: 2,
      storage: createJSONStorage(() => getStorage()),
      migrate: (persisted) => persisted as SettingsState,
    },
  ),
);
