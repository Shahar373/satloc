import { useSelection } from '../state/selection';
import { useUi } from '../state/ui';
import { useViewerStore } from '../state/viewer';
import { flyHome } from '../viewer/createViewer';
import { TimeControls } from './TimeControls';
import { UpdateBanner } from './UpdateBanner';

function formatUtc(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatMultiplier(multiplier: number): string {
  const abs = Math.abs(multiplier);
  const text = abs >= 1 ? `${Math.round(abs)}x` : `${abs.toFixed(2)}x`;
  return multiplier < 0 ? `-${text}` : text;
}

export function TopBar() {
  const simTime = useViewerStore((s) => s.simTime);
  const multiplier = useViewerStore((s) => s.multiplier);
  const animating = useViewerStore((s) => s.animating);
  const imagery = useViewerStore((s) => s.imagery);
  const viewer = useViewerStore((s) => s.viewer);
  const problems = useViewerStore((s) => s.problems);
  const settingsOpen = useUi((s) => s.settingsOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  return (
    <header className="topbar">
      <span className="topbar__brand">SatLoc</span>
      <span className="topbar__dim topbar__tagline">Earth · real-time satellites</span>
      <span className="topbar__spacer" />
      <UpdateBanner />
      {problems.map((p) => (
        <span key={p.label} className="badge badge--warn" title={p.detail} role="status" data-testid="viewer-problem">
          {p.label}
        </span>
      ))}
      {imagery === 'offline' && (
        <span className="badge badge--warn" title="Online imagery is unreachable; showing bundled low-resolution tiles.">
          Offline imagery
        </span>
      )}
      {simTime && (
        <span className="topbar__time" data-testid="sim-time">
          {formatUtc(simTime)}
          <span className="topbar__dim"> · {animating ? formatMultiplier(multiplier) : 'paused'}</span>
        </span>
      )}
      <TimeControls />
      <button
        type="button"
        className="btn btn--icon"
        disabled={!viewer}
        title="Whole-planet view"
        aria-label="Home view"
        onClick={() => {
          if (!viewer) return;
          useSelection.getState().setCameraMode('free');
          flyHome(viewer);
        }}
      >
        ⌂
      </button>
      <button
        type="button"
        className={`btn btn--icon${settingsOpen ? ' btn--on' : ''}`}
        title="Settings"
        aria-label="Settings"
        onClick={() => setSettingsOpen(!settingsOpen)}
      >
        ⚙
      </button>
    </header>
  );
}
