import { create } from 'zustand';
import type { ImagingMode } from '../contracts/domain';
import type { ScheduledDownlinkCandidate } from '../core/scenario/executablePlan';

interface PlanDraftState {
  ids: string[];
  modes: Record<string, ImagingMode>;
  downlinks: ScheduledDownlinkCandidate[];
  waivers: Record<string, string>;
  revision: number;
  toggle: (id: string, mode?: ImagingMode) => void;
  toggleDownlink: (candidate: ScheduledDownlinkCandidate) => void;
  setWaiver: (key: string, reason: string | null) => void;
}

/** Draft edits invalidate waivers. A committed run owns a separate snapshot of the plan. */
export function createPlanDraftStore() {
  return create<PlanDraftState>()((set) => ({
    ids: [],
    modes: {},
    downlinks: [],
    waivers: {},
    revision: 0,
    toggle: (id, mode = 'PAN') =>
      set((state) => {
        const removing = state.ids.includes(id);
        const modes = { ...state.modes };
        if (removing) delete modes[id];
        else modes[id] = mode;
        return {
          ids: removing ? state.ids.filter((existing) => existing !== id) : [...state.ids, id].sort(),
          modes,
          downlinks: removing
            ? state.downlinks
                .map((d) => ({ ...d, dataProductCandidateIds: d.dataProductCandidateIds.filter((p) => p !== id) }))
                .filter((d) => d.dataProductCandidateIds.length > 0)
            : state.downlinks,
          waivers: {},
          revision: state.revision + 1,
        };
      }),
    toggleDownlink: (candidate) =>
      set((state) => ({
        downlinks: state.downlinks.some((d) => d.id === candidate.id)
          ? state.downlinks.filter((d) => d.id !== candidate.id)
          : [...state.downlinks, structuredClone(candidate)],
        waivers: {},
        revision: state.revision + 1,
      })),
    setWaiver: (key, reason) =>
      set((state) => {
        const waivers = { ...state.waivers };
        if (reason === null) delete waivers[key];
        else waivers[key] = reason;
        return { waivers, revision: state.revision + 1 };
      }),
  }));
}
export const usePlanDraft = createPlanDraftStore();
