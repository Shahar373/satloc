import { GlobeCanvas } from '../../viewer/GlobeCanvas';
import { useViewerStore } from '../../state/viewer';

/**
 * Explore workspace body for Shell V2: the real Cesium canvas (`GlobeCanvas` owns creation and
 * teardown, shared with Shell V1's `GlobeView`), plus a minimal honest status line. Shell V2
 * doesn't have its own hint/tooltip/camera-mode chrome yet (Timeline, HoverTooltip, and the
 * rest of that overlay UI are separate, not-yet-scheduled task-list items) — but a silent blank
 * globe while it starts, or a silent failure, would be worse than this.
 */
export function GlobeExploreV2() {
  const ready = useViewerStore((s) => s.ready);
  const error = useViewerStore((s) => s.error);

  return (
    <div className="sl-globe-explore">
      <GlobeCanvas className="sl-globe-canvas" />
      {!error && !ready && (
        <div className="sl-globe-status" role="status">
          Starting the 3D globe…
        </div>
      )}
      {error && (
        <div className="sl-globe-status sl-globe-status--error" role="alert">
          The 3D globe could not start: {error}
        </div>
      )}
    </div>
  );
}
