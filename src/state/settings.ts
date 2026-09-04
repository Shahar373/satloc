import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../platform/storage';
import type { ImagerySource } from '../viewer/imagery';

export interface SettingsState {
  /** Which base imagery to use. 'auto' probes the network and falls back to the bundled offline tiles. */
  imagery: ImagerySource;
  setImagery(imagery: ImagerySource): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      imagery: 'auto',
      setImagery: (imagery) => set({ imagery }),
    }),
    {
      name: 'satloc.settings',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
    },
  ),
);
