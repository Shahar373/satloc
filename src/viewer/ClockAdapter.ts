import { JulianDate, type Viewer } from 'cesium';
import { SimulationClock } from '../core/clock/SimulationClock';

/**
 * Mirrors a live Cesium `Viewer.clock` into a `SimulationClock`, one-directional: the viewer's
 * clock stays authoritative (this project's rule — simulation time comes from
 * `viewer.clock.currentTime`, never from a separately-advancing timer), and this adapter just
 * republishes it in the Cesium-independent shape `src/core`/workers/tests consume. Compare
 * `useViewerStore.attach()`, which does the same mirroring into Zustand for the UI; this is the
 * equivalent for a `SimulationClock` instance. Returns an unsubscribe function.
 */
export function attachClockAdapter(viewer: Viewer, clock: SimulationClock): () => void {
  return viewer.clock.onTick.addEventListener((viewerClock) => {
    const simTime = JulianDate.toDate(viewerClock.currentTime);
    if (viewerClock.shouldAnimate !== clock.running) {
      if (viewerClock.shouldAnimate) clock.resume();
      else clock.pause();
    }
    // Cesium's clock.multiplier can in principle be <= 0 (this app clamps it to 1-60, but a
    // future caller of createViewer might not) — SimulationClock requires a positive rate, so a
    // non-positive multiplier is left unmirrored rather than throwing inside a Cesium tick handler.
    if (viewerClock.multiplier > 0 && viewerClock.multiplier !== clock.multiplier) {
      clock.setMultiplier(viewerClock.multiplier);
    }
    clock.seek(simTime);
  });
}
