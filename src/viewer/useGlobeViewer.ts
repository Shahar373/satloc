import { useEffect, useRef, type RefObject } from 'react';
import { JulianDate, type Viewer } from 'cesium';
import { useImagerySource, useOverrides } from '../state/overrides';
import { useSettings } from '../state/settings';
import { useViewerStore } from '../state/viewer';
import { captureView, createViewer, type CreateViewerOptions } from './createViewer';

type Carried = { time: Date } & NonNullable<CreateViewerOptions['restore']>;

/**
 * Owns the Cesium `Viewer` lifecycle against `containerRef`: creates it on mount and whenever
 * imagery/ion token/initial time change, destroys it on unmount or before re-creating, and
 * carries clock + camera state across an imagery swap so switching sources doesn't reset the
 * session. Publishes viewer/ready/error state to the shared `useViewerStore`, so it works the
 * same regardless of which shell (V1's `GlobeView` or V2's `GlobeCanvas`) mounts it — only one of
 * the two is ever mounted at a time, since `main.tsx` renders exactly one shell.
 */
export function useGlobeViewer(containerRef: RefObject<HTMLDivElement | null>) {
  const carriedRef = useRef<Carried | null>(null);
  const imagery = useImagerySource();
  const initialTime = useOverrides((s) => s.time);
  const ionToken = useSettings((s) => s.ionToken);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let viewer: Viewer | undefined;
    const store = useViewerStore.getState();
    const carried = carriedRef.current;
    carriedRef.current = null;

    createViewer(container, {
      imagery,
      ionToken,
      initialTime: carried?.time ?? initialTime,
      restore: carried ?? undefined,
      onProblem: (problem) => {
        if (!cancelled) useViewerStore.getState().addProblem(problem);
      },
      onImageryResolved: (resolved) => {
        if (!cancelled) useViewerStore.getState().setImagery(resolved, false);
      },
    })
      .then((created) => {
        if (cancelled) {
          created.viewer.destroy();
          return;
        }
        viewer = created.viewer;
        window.__satlocViewer = created.viewer;
        store.attach(created.viewer, created.imagery);
        if (created.imageryPending) store.setImagery(created.imagery, true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error('Failed to create the Cesium viewer', err);
        store.setError(message);
      });

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        carriedRef.current = {
          time: JulianDate.toDate(viewer.clock.currentTime),
          multiplier: viewer.clock.multiplier,
          animating: viewer.clock.shouldAnimate,
          view: captureView(viewer),
        };
      }
      if (window.__satlocViewer === viewer) delete window.__satlocViewer;
      useViewerStore.getState().detach();
      viewer?.destroy();
    };
  }, [containerRef, imagery, ionToken, initialTime]);
}
