import { isTauri } from '../platform/env';
import { useCatalog } from '../state/catalog';
import { useObserver } from '../state/observer';
import { useSelection } from '../state/selection';
import { useSettings } from '../state/settings';
import { useTargets } from '../state/targets';
import { useViewerStore } from '../state/viewer';
import { formatClockOffset } from './format';

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.1.0';
export const ISSUES_URL = 'https://github.com/Shahar373/satloc/issues/new';

function webglRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return 'no WebGL context';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
    return `${renderer} (${gl instanceof WebGL2RenderingContext ? 'WebGL 2' : 'WebGL 1'})`;
  } catch {
    return 'unknown';
  }
}

/** Plain-text state summary for bug reports; contains no token, only whether one is set. */
export function diagnosticsText(extra?: string): string {
  const viewer = useViewerStore.getState();
  const catalog = useCatalog.getState();
  const settings = useSettings.getState();
  const selection = useSelection.getState();
  const targets = useTargets.getState();
  const observer = useObserver.getState();
  const simTime = viewer.simTime;
  const lines = [
    `SatLoc ${APP_VERSION} · ${isTauri() ? 'desktop app' : 'browser'} · ${new Date().toISOString()}`,
    `Platform: ${navigator.userAgent}`,
    `Graphics: ${webglRenderer()}`,
    `Imagery: chosen ${settings.imagery}, showing ${viewer.imagery ?? 'none'}${viewer.imageryPending ? ' (probing)' : ''}, Ion token ${settings.ionToken ? 'set' : 'not set'}`,
    `Globe: ready ${viewer.ready}, error ${viewer.error ?? 'none'}, problems ${viewer.problems.map((p) => `${p.label}: ${p.detail}`).join(' | ') || 'none'}`,
    `Elements: ${catalog.source}, fetched ${catalog.fetchedAt?.toISOString() ?? 'never'}, status ${catalog.status}, error ${catalog.error ?? 'none'}, notice ${catalog.notice ?? 'none'}`,
    `Groups: ${
      Object.values(catalog.groups)
        .map((g) => `${g.id} ${g.status} ${g.records.length}${g.error ? ` (${g.error})` : ''}`)
        .join(', ') || 'none'
    }; displayed ${settings.displayedGroups.join(', ') || 'none'}; points limit ${settings.maxCatalogPoints}; on globe ${
      catalog.pointStats ? `${catalog.pointStats.shown}/${catalog.pointStats.total}` : 'n/a'
    }; worker error ${catalog.workerError ?? 'none'}`,
    `Clock: simulation ${simTime?.toISOString() ?? 'n/a'} (${simTime ? formatClockOffset(simTime.getTime() - Date.now()) : 'n/a'} from now), ${viewer.multiplier}x, ${viewer.animating ? 'running' : 'paused'}; PC clock vs server ${catalog.clockOffsetMs === null ? 'unknown' : formatClockOffset(catalog.clockOffsetMs)}`,
    `Selection: ${selection.selectedId ?? 'none'}, camera ${selection.cameraMode}, overlays orbit=${selection.showOrbit} track=${selection.showGroundTrack} footprint=${selection.showFootprint} swath=${selection.showSwath} reach=${selection.showReach}`,
    `Targets: ${targets.targets.length} (selected ${targets.selectedTargetId ?? 'none'}), roll ≤ ${targets.maxOffNadirDeg}°, sun ≥ ${targets.minSunElevationDeg}°, ${targets.forecastDays} d; observer ${observer.name} ${observer.latitudeDeg.toFixed(3)}, ${observer.longitudeDeg.toFixed(3)}, min ${observer.minElevationDeg}°`,
    `Pinned: ${settings.favorites.map((f) => f.noradId).join(', ') || 'none'}`,
  ];
  if (extra) lines.push('', extra);
  return lines.join('\n');
}

export async function copyDiagnostics(extra?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(diagnosticsText(extra));
    return true;
  } catch (err) {
    console.warn('Clipboard write failed', err);
    return false;
  }
}
