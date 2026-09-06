import { useRef, useState } from 'react';
import { JulianDate } from 'cesium';
import { jumpToNow, setSimulationTime } from '../viewer/createViewer';
import { useViewerStore } from '../state/viewer';

/** Speed presets, in simulated seconds per real second. Negative runs time backwards. */
const SPEEDS = [-1000, -300, -60, -10, -1, 1, 10, 60, 300, 1000];
/** Years a typed date must fall in before it is applied (keeps "0002" out of the clock while typing). */
const MIN_YEAR = 1957;
const MAX_YEAR = 2100;

function formatMultiplier(multiplier: number): string {
  const abs = Math.abs(multiplier);
  const text = abs >= 1 ? `${Math.round(abs)}x` : `${abs.toFixed(2)}x`;
  return multiplier < 0 ? `-${text}` : text;
}

/** `datetime-local` value (no zone, minutes) for a UTC instant. */
function toInputValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

export function TimeControls() {
  const viewer = useViewerStore((s) => s.viewer);
  const simTime = useViewerStore((s) => s.simTime);
  const multiplier = useViewerStore((s) => s.multiplier);
  const animating = useViewerStore((s) => s.animating);
  // While the date field is focused it holds the user's draft; the live clock stops overwriting it.
  const [draft, setDraft] = useState<string | null>(null);
  // Value at focus time (an unedited field must not commit its minute-truncated copy) and the Esc flag.
  const focusValue = useRef<string>('');
  const cancelled = useRef(false);

  const speedOptions = SPEEDS.includes(multiplier) ? SPEEDS : [...SPEEDS, multiplier].sort((a, b) => a - b);

  const commitDraft = (value: string) => {
    if (!viewer || !value) return;
    const parsed = new Date(value + 'Z');
    const year = parsed.getUTCFullYear();
    if (Number.isNaN(parsed.getTime()) || year < MIN_YEAR || year > MAX_YEAR) return;
    setSimulationTime(viewer, JulianDate.fromDate(parsed));
  };

  return (
    <div className="timectl" data-testid="time-controls">
      <button
        type="button"
        className="btn btn--icon"
        disabled={!viewer}
        aria-label={animating ? 'Pause' : 'Play'}
        title={animating ? 'Pause simulation (Space)' : 'Run simulation (Space)'}
        onClick={() => {
          if (viewer) viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate;
        }}
      >
        {animating ? '❚❚' : '▶'}
      </button>
      <select
        className="select"
        aria-label="Simulation speed"
        title="Simulated seconds per real second ([ and ] step through the presets)"
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
        aria-label="Simulation time (UTC)"
        title="Jump to a UTC date and time (applied when you press Enter or leave the field)"
        disabled={!viewer || !simTime}
        value={draft ?? (simTime ? toInputValue(simTime) : '')}
        onFocus={(e) => {
          focusValue.current = e.currentTarget.value;
          cancelled.current = false;
          setDraft(e.currentTarget.value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const value = e.currentTarget.value;
          if (!cancelled.current && value !== focusValue.current) commitDraft(value);
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            // blur() fires onBlur synchronously, before React applies setDraft(null): flag it first.
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="topbar__dim">UTC</span>
      <button
        type="button"
        className="btn"
        disabled={!viewer}
        onClick={() => viewer && jumpToNow(viewer)}
        title="Return to the current time at 1x (N)"
      >
        Now
      </button>
    </div>
  );
}
