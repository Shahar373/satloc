import { useViewerStore } from '../state/viewer';
import { TimeControls } from './TimeControls';

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
          <span className="topbar__dim"> · {animating ? formatMultiplier(multiplier) : 'paused'}</span>
        </span>
      )}
      <TimeControls />
    </header>
  );
}
