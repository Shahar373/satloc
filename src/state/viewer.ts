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
  /** Simulation time, refreshed a few times per second (not every frame). */
  simTime: Date | null;
  multiplier: number;
  animating: boolean;
  attach(viewer: Viewer, imagery: ImageryResolved): void;
  detach(): void;
  setError(message: string): void;
  addProblem(problem: ViewerProblem): void;
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
    simTime: null,
    multiplier: 1,
    animating: true,

    attach(viewer, imagery) {
      get().detach();
      set({ viewer, imagery, ready: false, error: null, problems: [] });

      let lastPush = 0;
      removeTick = viewer.clock.onTick.addEventListener((clock) => {
        const now = performance.now();
        if (now - lastPush < SIM_TIME_REFRESH_MS) return;
        lastPush = now;
        set({
          simTime: JulianDate.toDate(clock.currentTime),
          multiplier: clock.multiplier,
          animating: clock.shouldAnimate,
        });
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
      set({ viewer: null, imagery: null, ready: false, simTime: null, multiplier: 1, animating: true });
    },

    setError(message) {
      set({ error: message });
    },

    addProblem(problem) {
      set((s) => (s.problems.some((p) => p.label === problem.label) ? s : { problems: [...s.problems, problem] }));
    },
  };
});
