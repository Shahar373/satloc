import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../platform/env';
import { HoverTooltip } from '../ui/HoverTooltip';
import { copyDiagnostics } from '../ui/diagnostics';
import { useUi } from '../state/ui';
import { useSelection } from '../state/selection';
import { useViewerStore } from '../state/viewer';
import { Timeline } from '../ui/Timeline';
import { useGlobeViewer } from './useGlobeViewer';

/** Stop saying "loading imagery" after this long even if some tiles never arrive. */
const LOADING_HINT_MAX_MS = 20_000;

const CAMERA_MODE_LABELS = {
  free: 'free',
  track: 'following the satellite',
  nadir: 'looking straight down from the satellite',
  imaging: 'looking at the target from the satellite',
} as const;

function describeStartupError(message: string): string {
  if (/webgl/i.test(message)) {
    return isTauri()
      ? 'SatLoc needs WebGL 2, which the graphics driver did not provide. Updating the graphics driver usually fixes this.'
      : 'SatLoc needs WebGL 2. Check your graphics drivers or try another browser.';
  }
  if (/NaturalEarthII|tilemapresource|Assets\//i.test(message)) {
    return 'The bundled globe assets could not be loaded. The installation may be incomplete; reinstalling SatLoc should fix it.';
  }
  return 'Something went wrong while creating the globe. Trying again usually helps; if not, please report the message below.';
}

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);
  useGlobeViewer(containerRef);
  const hasViewer = useViewerStore((s) => s.viewer !== null);
  const ready = useViewerStore((s) => s.ready);
  const error = useViewerStore((s) => s.error);
  const cameraMode = useSelection((s) => s.cameraMode);
  const hintDismissed = useUi((s) => s.hintDismissed);
  const dismissHint = useUi((s) => s.dismissHint);
  const [hintExpired, setHintExpired] = useState(false);

  useEffect(() => {
    setHintExpired(false);
    if (!hasViewer || ready) return;
    const timer = window.setTimeout(() => setHintExpired(true), LOADING_HINT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [hasViewer, ready]);

  const showHint = !error && !ready && !hintExpired;

  return (
    <div ref={containerRef} className="globe" data-testid="globe" data-ready={ready ? 'true' : 'false'}>
      <Timeline />
      <HoverTooltip />
      {showHint && (
        <div className="globe__loading" role="status" data-testid="globe-loading">
          <span className="globe__spinner" aria-hidden="true" />
          {hasViewer ? 'Loading imagery…' : 'Starting the 3D globe…'}
        </div>
      )}
      {ready && !hintDismissed && (
        <div className="globe__hint" role="note" data-testid="first-run-hint">
          <span>
            Click a satellite in the list or on the globe · drag the timeline to move in time · ⚙ lists the keyboard
            shortcuts
          </span>
          <button type="button" className="link" onClick={dismissHint} aria-label="Dismiss hint" title="Dismiss">
            ×
          </button>
        </div>
      )}
      {cameraMode !== 'free' && (
        <div className="globe__mode" role="status" data-testid="camera-mode">
          Camera: {CAMERA_MODE_LABELS[cameraMode]}
          <button
            type="button"
            className="link"
            onClick={() => useSelection.getState().setCameraMode('free')}
            title="Release the camera (Esc)"
          >
            release
          </button>
        </div>
      )}
      {error && (
        <div className="error-panel" role="alert">
          <div>
            <strong>The 3D globe could not start.</strong>
            <div>{describeStartupError(error)}</div>
            <code>{error}</code>
            <p className="toggles">
              <button type="button" className="btn" onClick={() => window.location.reload()}>
                Try again
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void copyDiagnostics(`Globe start-up error: ${error}`)}
              >
                Copy diagnostics
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
