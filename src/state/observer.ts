import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../platform/storage';

export interface ObserverLocation {
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
  heightM: number;
}

export interface ObserverState extends ObserverLocation {
  /** Minimum elevation for a pass to count, degrees. */
  minElevationDeg: number;
  setLocation(location: ObserverLocation): void;
  setMinElevation(deg: number): void;
}

/** Default observer: Tel Aviv. */
export const DEFAULT_OBSERVER: ObserverLocation = {
  name: 'Tel Aviv',
  latitudeDeg: 32.0853,
  longitudeDeg: 34.7818,
  heightM: 30,
};

export const useObserver = create<ObserverState>()(
  persist(
    (set) => ({
      ...DEFAULT_OBSERVER,
      minElevationDeg: 10,
      setLocation: (location) => set({ ...location }),
      setMinElevation: (minElevationDeg) => set({ minElevationDeg }),
    }),
    {
      name: 'satloc.observer',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
      partialize: (s) => ({
        name: s.name,
        latitudeDeg: s.latitudeDeg,
        longitudeDeg: s.longitudeDeg,
        heightM: s.heightM,
        minElevationDeg: s.minElevationDeg,
      }),
    },
  ),
);

/** Human-readable "32.09° N, 34.78° E". */
export function formatLocation(loc: Pick<ObserverLocation, 'latitudeDeg' | 'longitudeDeg'>): string {
  const lat = `${Math.abs(loc.latitudeDeg).toFixed(2)}° ${loc.latitudeDeg >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(loc.longitudeDeg).toFixed(2)}° ${loc.longitudeDeg >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}
