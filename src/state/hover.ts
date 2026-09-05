import { create } from 'zustand';
import type { HoverInfo } from '../viewer/catalogLayer';

interface HoverState {
  hover: HoverInfo | null;
  setHover(hover: HoverInfo | null): void;
}

export const useHover = create<HoverState>()((set) => ({
  hover: null,
  setHover: (hover) => set({ hover }),
}));
