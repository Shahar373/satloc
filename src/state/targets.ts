import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStorage } from '../platform/storage';

export interface ImagingTarget {
  id: string;
  name: string;
  latitudeDeg: number;
  longitudeDeg: number;
}

export interface TargetsState {
  targets: ImagingTarget[];
  selectedTargetId: string | null;
  /** Largest roll angle the satellite may use, degrees. */
  maxOffNadirDeg: number;
  /** Minimum Sun elevation at the target for an optical image, degrees. */
  minSunElevationDeg: number;
  forecastDays: number;
  addTarget(target: Omit<ImagingTarget, 'id'>): ImagingTarget;
  updateTarget(id: string, patch: Partial<Omit<ImagingTarget, 'id'>>): void;
  removeTarget(id: string): void;
  /** Put a removed target back (undo), at `index` when given. */
  restoreTarget(target: ImagingTarget, index?: number): void;
  selectTarget(id: string | null): void;
  setMaxOffNadir(deg: number): void;
  setMinSunElevation(deg: number): void;
  setForecastDays(days: number): void;
}

const DEFAULT_TARGETS: ImagingTarget[] = [
  { id: 'tel-aviv', name: 'Tel Aviv', latitudeDeg: 32.0853, longitudeDeg: 34.7818 },
];

function newId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const useTargets = create<TargetsState>()(
  persist(
    (set) => ({
      targets: DEFAULT_TARGETS,
      selectedTargetId: 'tel-aviv',
      maxOffNadirDeg: 45,
      minSunElevationDeg: 15,
      forecastDays: 7,
      addTarget: (target) => {
        const created = { ...target, id: newId() };
        set((s) => ({ targets: [...s.targets, created], selectedTargetId: created.id }));
        return created;
      },
      updateTarget: (id, patch) =>
        set((s) => ({ targets: s.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTarget: (id) =>
        set((s) => ({
          targets: s.targets.filter((t) => t.id !== id),
          selectedTargetId: s.selectedTargetId === id ? null : s.selectedTargetId,
        })),
      restoreTarget: (target, index) =>
        set((s) => {
          if (s.targets.some((t) => t.id === target.id)) return s;
          const targets = [...s.targets];
          targets.splice(index === undefined ? targets.length : Math.min(index, targets.length), 0, target);
          return { targets, selectedTargetId: s.selectedTargetId ?? target.id };
        }),
      selectTarget: (selectedTargetId) => set({ selectedTargetId }),
      setMaxOffNadir: (maxOffNadirDeg) => set({ maxOffNadirDeg }),
      setMinSunElevation: (minSunElevationDeg) => set({ minSunElevationDeg }),
      setForecastDays: (forecastDays) => set({ forecastDays }),
    }),
    {
      name: 'satloc.targets',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
    },
  ),
);

/** "Target N" with the smallest N not already used, so names stay unique after removals. */
export function nextTargetName(targets: readonly ImagingTarget[]): string {
  const used = new Set<number>();
  for (const t of targets) {
    const m = /^Target (\d+)$/.exec(t.name);
    if (m) used.add(Number(m[1]));
  }
  let n = targets.length + 1;
  while (used.has(n)) n += 1;
  return `Target ${n}`;
}

export function formatLatLon(latitudeDeg: number, longitudeDeg: number): string {
  const lat = `${Math.abs(latitudeDeg).toFixed(3)}° ${latitudeDeg >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitudeDeg).toFixed(3)}° ${longitudeDeg >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}
