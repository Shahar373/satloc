import type { Viewer } from 'cesium';
import { JulianDate } from 'cesium';
import { create } from 'zustand';
import type { ViewerProblem } from '../viewer/createViewer';
import type { ImageryResolved } from '../viewer/imagery';

export interface ViewerState {
  viewer: Viewer | null;
  imagery: ImageryResolved | null;
  /** True once the globe has rendered with all visible tiles loaded. */
  ready: boolean;
  error: string | null;
  /** Non-fatal data-source problems (imagery, terrain), newest last. */
  problems: ViewerProblem[];
  /** True while the online imagery is still being probed (the globe shows offline tiles meanwhile). */
  imageryPending: boolean;
  /** Simulation time, refreshed a few times per second (not every frame). */
  simTime: Date | null;
  multiplier: number;
  animating: boolean;
  attach(viewer: Viewer, imagery: ImageryResolved): void;
  detach(): void;
  setError(message: string): void;
  addProblem(problem: ViewerProblem): void;
  setImagery(imagery: ImageryResolved, pending: boolean): void;
}

const SIM_TIME_REFRESH_MS = 250;

export const useViewerStore = create<ViewerState>()((set, get) => {
  let removeTick: (() => void) | undefined;
  let removeRender: (() => void) | undefined;

  return {
    viewer: null,
    imagery: null,
    ready: false,
    error: null,
    problems: [],
    imageryPending: false,
    simTime: null,
    multiplier: 1,
    animating: true,

    attach(viewer, imagery) {
      get().detach();
      set({ viewer, imagery, ready: false, error: null, problems: [], imageryPending: false });

      let lastPush = 0;
      let lastMs = Number.NaN;
      removeTick = viewer.clock.onTick.addEventListener((clock) => {
        const now = performance.now();
        if (now - lastPush < SIM_TIME_REFRESH_MS) return;
        lastPush = now;
        // Paused clock, same speed: nothing to publish (every subscriber would re-render for nothing).
        const ms = JulianDate.toDate(clock.currentTime).getTime();
        const state = get();
        if (ms === lastMs && clock.multiplier === state.multiplier && clock.shouldAnimate === state.animating) return;
        lastMs = ms;
        set({ simTime: new Date(ms), multiplier: clock.multiplier, animating: clock.shouldAnimate });
      });

      removeRender = viewer.scene.postRender.addEventListener(() => {
        if (viewer.scene.globe.tilesLoaded) {
          removeRender?.();
          removeRender = undefined;
          set({ ready: true });
        }
      });
    },

    detach() {
      removeTick?.();
      removeRender?.();
      removeTick = undefined;
      removeRender = undefined;
      set({ viewer: null, imagery: null, imageryPending: false, ready: false, simTime: null, multiplier: 1, animating: true });
    },

    setError(message) {
      set({ error: message });
    },

    setImagery(imagery, pending) {
      set({ imagery, imageryPending: pending });
    },

    addProblem(problem) {
      set((s) => (s.problems.some((p) => p.label === problem.label) ? s : { problems: [...s.problems, problem] }));
    },
  };
});
