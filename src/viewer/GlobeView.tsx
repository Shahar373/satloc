import { useEffect, useRef } from 'react';
import type { Viewer } from 'cesium';
import { useHover } from '../state/hover';
import { useImagerySource, useOverrides } from '../state/overrides';
import { useSettings } from '../state/settings';
import { useViewerStore } from '../state/viewer';
import { createViewer } from './createViewer';

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const imagery = useImagerySource();
  const initialTime = useOverrides((s) => s.time);
  const ionToken = useSettings((s) => s.ionToken);
  const ready = useViewerStore((s) => s.ready);
  const error = useViewerStore((s) => s.error);
  const hover = useHover((s) => s.hover);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let viewer: Viewer | undefined;
    const store = useViewerStore.getState();

    createViewer(container, { imagery, ionToken, initialTime })
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
      if (window.__satlocViewer === viewer) delete window.__satlocViewer;
      useViewerStore.getState().detach();
      viewer?.destroy();
    };
  }, [imagery, ionToken, initialTime]);

  return (
    <div
      ref={containerRef}
      className="globe"
      data-testid="globe"
      data-ready={ready ? 'true' : 'false'}
    >
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} data-testid="tooltip">
          {hover.name} <span className="topbar__dim">{hover.noradId}</span>
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
