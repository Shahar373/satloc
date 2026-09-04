import { JulianDate } from 'cesium';
import { jumpToNow, setSimulationTime } from '../viewer/createViewer';
import { useViewerStore } from '../state/viewer';

/** Speed presets, in simulated seconds per real second. Negative runs time backwards. */
const SPEEDS = [-1000, -300, -60, -10, -1, 1, 10, 60, 300, 1000];

function formatMultiplier(multiplier: number): string {
  const abs = Math.abs(multiplier);
  const text = abs >= 1 ? `${Math.round(abs)}x` : `${abs.toFixed(2)}x`;
  return multiplier < 0 ? `-${text}` : text;
}

/** `datetime-local` value (no zone) for a UTC instant. */
function toLocalInputValue(date: Date): string {
  return date.toISOString().slice(0, 19);
}

export function TimeControls() {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const multiplier = useViewerStore((s) => s.multiplier);
  const animating = useViewerStore((s) => s.animating);

  const speedOptions = SPEEDS.includes(multiplier) ? SPEEDS : [...SPEEDS, multiplier].sort((a, b) => a - b);

  return (
    <div className="timectl" data-testid="time-controls">
      <button
        type="button"
        className="btn btn--icon"
        disabled={!viewer}
        aria-label={animating ? 'Pause' : 'Play'}
        title={animating ? 'Pause simulation' : 'Run simulation'}
        onClick={() => {
          if (viewer) viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        }}
      >
        {animating ? '❚❚' : '▶'}
      </button>
      <select
        className="select"
        aria-label="Simulation speed"
        title="Simulated seconds per real second"
        disabled={!viewer}
        value={multiplier}
        onChange={(e) => {
          if (viewer) viewer.clock.multiplier = Number(e.target.value);
        }}
      >
        {speedOptions.map((speed) => (
          <option key={speed} value={speed}>
            {formatMultiplier(speed)}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="datetime-local"
        step="1"
        aria-label="Simulation time (UTC)"
        title="Jump to a UTC date and time"
        disabled={!viewer || !simTime}
        value={simTime ? toLocalInputValue(simTime) : ''}
        onChange={(e) => {
          if (!viewer || !e.target.value) return;
          const parsed = new Date(e.target.value + 'Z');
          if (!Number.isNaN(parsed.getTime())) setSimulationTime(viewer, JulianDate.fromDate(parsed));
        }}
      />
      <span className="topbar__dim">UTC</span>
      <button
        type="button"
        className="btn"
        disabled={!viewer}
        onClick={() => viewer && jumpToNow(viewer)}
        title="Return to the current time at 1x"
      >
        Now
      </button>
    </div>
  );
}
