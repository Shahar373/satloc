import { useTranslation } from 'react-i18next';
import { GlobeCanvas } from '../../viewer/GlobeCanvas';
import { useViewerStore } from '../../state/viewer';

/**
 * Explore workspace body: the real Cesium canvas (`GlobeCanvas` owns creation, teardown, and
 * satellite/observer/target rendering), plus a minimal honest status line. Shell V2 doesn't have
 * its own hint/tooltip/camera-mode overlay chrome yet (a separate, not-yet-scheduled task-list
 * item) — but a silent blank globe while it starts, or a silent failure, would be worse than this.
 */
export function GlobeExploreV2() {
  const { t } = useTranslation();
  const ready = useViewerStore((s) => s.ready);
  const error = useViewerStore((s) => s.error);

  return (
    <div className="sl-globe-explore">
      <GlobeCanvas className="sl-globe-canvas" />
      {!error && !ready && (
        <div className="sl-globe-status" role="status">
          {t('globe.starting')}
        </div>
      )}
      {error && (
        <div className="sl-globe-status sl-globe-status--error" role="alert">
          {t('globe.error', { message: error })}
        </div>
      )}
    </div>
  );
}
