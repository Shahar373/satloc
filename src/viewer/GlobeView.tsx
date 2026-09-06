import { useEffect, useRef, useState } from 'react';
import { JulianDate, type Viewer } from 'cesium';
import { useHover } from '../state/hover';
import { useImagerySource, useOverrides } from '../state/overrides';
import { useSettings } from '../state/settings';
import { useViewerStore } from '../state/viewer';
import { Timeline } from '../ui/Timeline';
import { captureView, createViewer, type CreateViewerOptions } from './createViewer';

/** Stop saying "loading imagery" after this long even if some tiles never arrive. */
const LOADING_HINT_MAX_MS = 20_000;

type Carried = { time: Date } & NonNullable<CreateViewerOptions['restore']>;

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // Clock and camera of the previous viewer, so changing imagery does not reset the session.
  const carriedRef = useRef<Carried | null>(null);
  const imagery = useImagerySource();
  const initialTime = useOverrides((s) => s.time);
  const ionToken = useSettings((s) => s.ionToken);
  const hasViewer = useViewerStore((s) => s.viewer !== null);
  const ready = useViewerStore((s) => s.ready);
  const error = useViewerStore((s) => s.error);
  const hover = useHover((s) => s.hover);
  const [hintExpired, setHintExpired] = useState(false);

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
    })
      .then((created) => {
        if (cancelled) {
          created.viewer.destroy();
          return;
        }
        viewer = created.viewer;
        window.__satlocViewer = created.viewer;
        store.attach(created.viewer, created.imagery);
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
  }, [imagery, ionToken, initialTime]);

  useEffect(() => {
    setHintExpired(false);
    if (!hasViewer || ready) return;
    const timer = window.setTimeout(() => setHintExpired(true), LOADING_HINT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [hasViewer, ready]);

  const showHint = !error && !ready && !hintExpired;

  return (
    <div
      ref={containerRef}
      className="globe"
      data-testid="globe"
      data-ready={ready ? 'true' : 'false'}
    >
      <Timeline />
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} data-testid="tooltip">
          {hover.name} <span className="topbar__dim">{hover.noradId}</span>
        </div>
      )}
      {showHint && (
        <div className="globe__loading" role="status" data-testid="globe-loading">
          <span className="globe__spinner" aria-hidden="true" />
          {hasViewer ? 'Loading imagery…' : 'Starting the 3D globe…'}
        </div>
      )}
      {error && (
        <div className="error-panel" role="alert">
          <div>
            <strong>The 3D globe could not start.</strong>
            <div>SatLoc needs WebGL 2. Check your graphics drivers or try another browser.</div>
            <code>{error}</code>
          </div>
        </div>
      )}
    </div>
  );
}
