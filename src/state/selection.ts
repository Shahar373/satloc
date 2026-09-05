import { create } from 'zustand';

export type CameraMode = 'free' | 'track' | 'nadir' | 'imaging';

export interface SelectionState {
  /** NORAD id of the selected satellite. */
  selectedId: number | null;
  showOrbit: boolean;
  showGroundTrack: boolean;
  /** Horizon footprint circle (where the satellite is above the horizon). */
  showFootprint: boolean;
  /** Imaging swath strip along the future ground track (imaging satellites only). */
  showSwath: boolean;
  /** Ground reach of the roll limit along the coming orbit, and the line of sight to the target. */
  showReach: boolean;
  /** free: user camera; track: follow; nadir: straight down; imaging: from the satellite towards the target. */
  cameraMode: CameraMode;
  select(id: number | null): void;
  toggleOrbit(): void;
  toggleGroundTrack(): void;
  toggleFootprint(): void;
  toggleSwath(): void;
  toggleReach(): void;
  setCameraMode(mode: CameraMode): void;
}

export const useSelection = create<SelectionState>()((set) => ({
  selectedId: null,
  showOrbit: true,
  showGroundTrack: true,
  showFootprint: true,
  showSwath: true,
  showReach: true,
  cameraMode: 'free',
  select: (id) => set((s) => ({ selectedId: id, cameraMode: id === null ? 'free' : s.cameraMode })),
  toggleOrbit: () => set((s) => ({ showOrbit: !s.showOrbit })),
  toggleGroundTrack: () => set((s) => ({ showGroundTrack: !s.showGroundTrack })),
  toggleFootprint: () => set((s) => ({ showFootprint: !s.showFootprint })),
  toggleSwath: () => set((s) => ({ showSwath: !s.showSwath })),
  toggleReach: () => set((s) => ({ showReach: !s.showReach })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
}));
