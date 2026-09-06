import { useCatalog } from '../state/catalog';
import { useImagerySource } from '../state/overrides';
import { formatClockOffset } from './format';
import { useSelection } from '../state/selection';
import { useUi } from '../state/ui';
import { useViewerStore } from '../state/viewer';
import { flyHome } from '../viewer/createViewer';
import { TimeControls } from './TimeControls';
import { UpdateBanner } from './UpdateBanner';

/** Warn when this PC's clock is further than this from the data server's (moves satellites by km). */
const CLOCK_WARN_MS = 30_000;

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
  const imageryPending = useViewerStore((s) => s.imageryPending);
  const chosenImagery = useImagerySource();
  const clockOffsetMs = useCatalog((s) => s.clockOffsetMs);
  // simTime is refreshed a few times a second, so this comparison stays current.
  const offsetMs = simTime ? simTime.getTime() - Date.now() : 0;
  const live = animating && multiplier === 1 && Math.abs(offsetMs) < 2000;
  const clockWrong = clockOffsetMs !== null && Math.abs(clockOffsetMs) > CLOCK_WARN_MS;
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
      {clockWrong && (
        <span
          className="badge badge--warn"
          role="status"
          title={`This computer's clock is ${formatClockOffset(clockOffsetMs)} from the data server's. Satellite positions and pass times are shifted by that amount; fix the clock in Windows settings.`}
        >
          PC clock off by {formatClockOffset(clockOffsetMs).replace(/^[+−]/, '')}
        </span>
      )}
      {imagery === 'offline' && !imageryPending && (
        <span
          className="badge badge--warn"
          title={
            chosenImagery === 'offline'
              ? 'Showing the bundled low-resolution tiles, as chosen in Settings.'
              : 'Online imagery is unreachable; showing bundled low-resolution tiles.'
          }
        >
          Offline imagery
        </span>
      )}
      {simTime && (
        <span className="topbar__time" data-testid="sim-time">
          {formatUtc(simTime)}
          <span className="topbar__dim"> · {animating ? formatMultiplier(multiplier) : 'paused'}</span>
          {live ? (
            <span className="badge badge--ok badge--inline" title="The simulation follows the current time">
              live
            </span>
          ) : (
            <span
              className="badge badge--warn badge--inline"
              title="Simulation time differs from now; press N (or Now) to return to the present"
              data-testid="time-offset"
            >
              {formatClockOffset(offsetMs)}
            </span>
          )}
        </span>
      )}
      <TimeControls />
      <button
        type="button"
        className="btn btn--icon"
        disabled={!viewer}
        title="Whole-planet view (H)"
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
