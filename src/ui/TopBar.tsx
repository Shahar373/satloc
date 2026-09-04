import { jumpToNow } from '../viewer/createViewer';
import { useViewerStore } from '../state/viewer';

function formatUtc(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function formatMultiplier(multiplier: number): string {
  const abs = Math.abs(multiplier);
  const text = abs >= 1 ? `${Math.round(abs)}x` : `${abs.toFixed(2)}x`;
  return multiplier < 0 ? `-${text}` : text;
}

export function TopBar() {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const multiplier = useViewerStore((s) => s.multiplier);
  const imagery = useViewerStore((s) => s.imagery);

  return (
    <header className="topbar">
      <span className="topbar__brand">SatLoc</span>
      <span className="topbar__dim">Earth · real-time satellites</span>
      <span className="topbar__spacer" />
      {imagery === 'offline' && (
        <span className="badge badge--warn" title="Online imagery is unreachable; showing bundled low-resolution tiles.">
          Offline imagery
        </span>
      )}
      {simTime && (
        <span className="topbar__time" data-testid="sim-time">
          {formatUtc(simTime)}
          <span className="topbar__dim"> · {formatMultiplier(multiplier)}</span>
        </span>
      )}
      <button
        type="button"
        className="btn"
        disabled={!viewer}
        onClick={() => viewer && jumpToNow(viewer)}
        title="Return to the current time at 1x"
      >
        Now
      </button>
    </header>
  );
}
