/** Tick planning for the timeline: pure, unit-testable. */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
export const TICK_STEPS_MS = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];

export interface Tick {
  timeMs: number;
  label: string;
  /** Day boundary (or first tick of a multi-day step): gets the date label. */
  major: boolean;
}

/** Smallest step that keeps ticks at least `minPx` apart. */
export function chooseTickStep(spanMs: number, widthPx: number, minPx = 90): number {
  for (const step of TICK_STEPS_MS) {
    if ((step / spanMs) * widthPx >= minPx) return step;
  }
  return TICK_STEPS_MS[TICK_STEPS_MS.length - 1]!;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTick(timeMs: number, stepMs: number): string {
  const d = new Date(timeMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const isMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  if (stepMs >= DAY || isMidnight) return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${hh}:${mm}`;
}

export function computeTicks(startMs: number, endMs: number, widthPx: number): { step: number; ticks: Tick[] } {
  const step = chooseTickStep(endMs - startMs, widthPx);
  const ticks: Tick[] = [];
  const first = Math.ceil(startMs / step) * step;
  for (let t = first; t <= endMs; t += step) {
    const d = new Date(t);
    const major = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
    ticks.push({ timeMs: t, label: formatTick(t, step), major });
  }
  return { step, ticks };
}
