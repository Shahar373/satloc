import { create } from 'zustand';

/** Draft selections survive workspace changes; closing/reloading the app starts a new draft. */
export const usePlanDraft = create<{
  ids: string[];
  toggle: (id: string) => void;
}>()((set) => ({
  ids: [],
  toggle: (id) =>
    set((state) => ({
      ids: state.ids.includes(id) ? state.ids.filter((existing) => existing !== id) : [...state.ids, id].sort(),
    })),
}));
