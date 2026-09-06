import { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '../state/viewer';

/** After a jump (scrubbing, a "jump to pass"), wait this long for the clock to settle before recomputing. */
const SETTLE_MS = 400;

/**
 * Start of a forecast window that follows the simulation clock in coarse jumps: it moves only when
 * the clock has drifted more than `driftMs` from it. Ordinary playback moves it at once; a jump
 * (the timeline being dragged at 4 Hz) is debounced so a multi-day forecast is not recomputed per tick.
 */
export function useForecastWindow(simTime: Date | null, driftMs: number): Date | null {
  const [windowStart, setWindowStart] = useState<Date | null>(null);
  const last = useRef<{ ms: number; at: number } | null>(null);
  const latest = useRef<Date | null>(null);
  latest.current = simTime;

  useEffect(() => {
    if (!simTime) return;
    const now = performance.now();
    const previous = last.current;
    last.current = { ms: simTime.getTime(), at: now };

    if (windowStart && Math.abs(simTime.getTime() - windowStart.getTime()) <= driftMs) return;
    if (!windowStart) {
      setWindowStart(simTime);
      return;
    }
    // Playback: the clock moved about multiplier x elapsed real time. Anything else is a jump.
    const { multiplier, animating } = useViewerStore.getState();
    const expected = previous && animating ? multiplier * (now - previous.at) : 0;
    const actual = previous ? simTime.getTime() - previous.ms : 0;
    const jump = !previous || Math.abs(actual - expected) > Math.max(2000, Math.abs(expected));
    if (!jump) {
      setWindowStart(simTime);
      return;
    }
    const timer = window.setTimeout(() => setWindowStart(latest.current ?? simTime), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [simTime, windowStart, driftMs]);
  return windowStart;
}
