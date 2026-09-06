import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../platform/storage';

interface UiState {
  settingsOpen: boolean;
  /** Sidebar panels the user collapsed, by panel id. */
  collapsed: Record<string, boolean>;
  setSettingsOpen(open: boolean): void;
  togglePanel(id: string): void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      settingsOpen: false,
      collapsed: {},
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      togglePanel: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
    }),
    {
      name: 'satloc.ui',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
      partialize: (s) => ({ collapsed: s.collapsed }),
    },
  ),
);
