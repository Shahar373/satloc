import { create } from 'zustand';

export type CameraMode = 'free' | 'track' | 'nadir';

export interface SelectionState {
  /** NORAD id of the selected satellite. */
  selectedId: number | null;
  showOrbit: boolean;
  showGroundTrack: boolean;
  /** Horizon footprint circle (where the satellite is above the horizon). */
  showFootprint: boolean;
  /** Imaging swath strip along the future ground track (imaging satellites only). */
  showSwath: boolean;
  /** free: user camera; track: follow the satellite; nadir: look straight down from it. */
  cameraMode: CameraMode;
  select(id: number | null): void;
  toggleOrbit(): void;
  toggleGroundTrack(): void;
  toggleFootprint(): void;
  toggleSwath(): void;
  setCameraMode(mode: CameraMode): void;
}

export const useSelection = create<SelectionState>()((set) => ({
  selectedId: null,
  showOrbit: true,
  showGroundTrack: true,
  showFootprint: true,
  showSwath: true,
  cameraMode: 'free',
  select: (id) => set((s) => ({ selectedId: id, cameraMode: id === null ? 'free' : s.cameraMode })),
  toggleOrbit: () => set((s) => ({ showOrbit: !s.showOrbit })),
  toggleGroundTrack: () => set((s) => ({ showGroundTrack: !s.showGroundTrack })),
  toggleFootprint: () => set((s) => ({ showFootprint: !s.showFootprint })),
  toggleSwath: () => set((s) => ({ showSwath: !s.showSwath })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
}));
