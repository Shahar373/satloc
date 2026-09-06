import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../platform/storage';

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

/** Selection and overlay toggles survive a relaunch; the camera mode always starts free. */
export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'satloc.selection',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
      partialize: (s) => ({
        selectedId: s.selectedId,
        showOrbit: s.showOrbit,
        showGroundTrack: s.showGroundTrack,
        showFootprint: s.showFootprint,
        showSwath: s.showSwath,
        showReach: s.showReach,
      }),
    },
  ),
);
