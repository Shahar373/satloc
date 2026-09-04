import { create } from 'zustand';

export interface SelectionState {
  /** NORAD id of the selected satellite. */
  selectedId: number | null;
  showOrbit: boolean;
  showGroundTrack: boolean;
  /** Camera follows the selected satellite. */
  tracking: boolean;
  select(id: number | null): void;
  toggleOrbit(): void;
  toggleGroundTrack(): void;
  setTracking(tracking: boolean): void;
}

export const useSelection = create<SelectionState>()((set) => ({
  selectedId: null,
  showOrbit: true,
  showGroundTrack: true,
  tracking: false,
  select: (id) => set((s) => ({ selectedId: id, tracking: id === null ? false : s.tracking })),
  toggleOrbit: () => set((s) => ({ showOrbit: !s.showOrbit })),
  toggleGroundTrack: () => set((s) => ({ showGroundTrack: !s.showGroundTrack })),
  setTracking: (tracking) => set({ tracking }),
}));
