import { create } from 'zustand';

/** Which click-on-globe mode is active. Layers that pick satellites stand down while it is set. */
export type PickingMode = null | 'observer' | 'target';

interface PickingState {
  mode: PickingMode;
  setMode(mode: PickingMode): void;
}

export const usePicking = create<PickingState>()((set) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
}));
