import { useEffect, useState } from 'react';

/** Wait this long after the clock stops moving before recomputing (scrubbing the timeline fires 4 Hz). */
const SETTLE_MS = 400;

/**
 * Start of a forecast window that follows the simulation clock in coarse jumps: it moves only when
 * the clock has drifted more than `driftMs` from it, and only once the clock has settled, so
 * scrubbing does not recompute a multi-day forecast on every tick.
 */
export function useForecastWindow(simTime: Date | null, driftMs: number): Date | null {
  const [windowStart, setWindowStart] = useState<Date | null>(null);
  useEffect(() => {
    if (!simTime) return;
    if (windowStart && Math.abs(simTime.getTime() - windowStart.getTime()) <= driftMs) return;
    if (!windowStart) {
      setWindowStart(simTime);
      return;
    }
    const timer = window.setTimeout(() => setWindowStart(simTime), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [simTime, windowStart, driftMs]);
  return windowStart;
}
