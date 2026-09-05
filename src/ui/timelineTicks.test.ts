import { describe, expect, it } from 'vitest';
import { chooseTickStep, computeTicks, formatTick } from './timelineTicks';

describe('timeline ticks', () => {
  it('picks coarser steps for wider windows', () => {
    expect(chooseTickStep(4 * 3_600_000, 900)).toBe(30 * 60_000); // 4 h in 900 px -> 30 min
    expect(chooseTickStep(48 * 3_600_000, 900)).toBe(6 * 3_600_000);
    expect(chooseTickStep(14 * 86_400_000, 900)).toBe(2 * 86_400_000);
    expect(chooseTickStep(10 * 60_000, 900)).toBe(60_000);
  });

  it('aligns ticks to the step and labels midnight with the date', () => {
    const start = Date.UTC(2026, 8, 4, 22, 7);
    const { step, ticks } = computeTicks(start, start + 4 * 3_600_000, 900);
    expect(step).toBe(30 * 60_000);
    expect(ticks[0]!.timeMs % step).toBe(0);
    expect(ticks[0]!.label).toBe('22:30');
    const midnight = ticks.find((t) => t.major);
    expect(midnight?.label).toBe('Sep 5');
    expect(ticks.length).toBeGreaterThanOrEqual(7);
    expect(ticks.length).toBeLessThanOrEqual(9);
  });

  it('formats day steps as dates', () => {
    expect(formatTick(Date.UTC(2026, 8, 5, 12, 0), 86_400_000)).toBe('Sep 5');
    expect(formatTick(Date.UTC(2026, 8, 5, 12, 0), 3_600_000)).toBe('12:00');
  });
});
