import { describe, expect, it } from 'vitest';
import { formatAgeSince, formatClockOffset, formatDuration, formatLocalBeside, formatLocalDateTime, formatUtcShort } from './format';

describe('formatDuration', () => {
  it('never prints 60 seconds', () => {
    expect(formatDuration(359.6)).toBe('6:00 min');
    expect(formatDuration(59.5)).toBe('1:00 min');
    expect(formatDuration(0)).toBe('0:00 min');
    expect(formatDuration(65)).toBe('1:05 min');
  });
});

describe('formatUtcShort', () => {
  it('prints month-day and hour-minute in UTC', () => {
    expect(formatUtcShort(new Date('2026-09-06T23:30:00Z'))).toBe('09-06 23:30');
  });
});

describe('formatAgeSince', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  it('scales from minutes to days', () => {
    expect(formatAgeSince(new Date('2026-09-06T11:59:50Z'), now)).toBe('just now');
    expect(formatAgeSince(new Date('2026-09-06T11:35:00Z'), now)).toBe('25 min ago');
    expect(formatAgeSince(new Date('2026-09-06T09:00:00Z'), now)).toBe('3 h ago');
    expect(formatAgeSince(new Date('2026-09-03T12:00:00Z'), now)).toBe('3.0 d ago');
  });
});

describe('formatLocalDateTime', () => {
  it('uses the same MM-DD HH:MM shape as the UTC column, in local time', () => {
    const d = new Date(2026, 8, 6, 23, 30);
    expect(formatLocalDateTime(d)).toBe('09-06 23:30');
  });
});

describe('formatLocalBeside', () => {
  it('adds the date only when the local day differs from the UTC day', () => {
    const noon = new Date(Date.UTC(2026, 8, 6, 12, 0));
    const offsetMin = noon.getTimezoneOffset();
    const expectedNoon = `${String(noon.getHours()).padStart(2, '0')}:${String(noon.getMinutes()).padStart(2, '0')}`;
    expect(formatLocalBeside(noon)).toBe(expectedNoon);
    // An instant whose local day differs (unless the zone is UTC itself).
    const nearMidnight = new Date(Date.UTC(2026, 8, 6, offsetMin < 0 ? 23 : 0, 30));
    if (offsetMin !== 0) expect(formatLocalBeside(nearMidnight)).toMatch(/^\d\d-\d\d \d\d:\d\d$/);
  });
});

describe('formatClockOffset', () => {
  it('scales units and keeps the sign', () => {
    expect(formatClockOffset(45_000)).toBe('+45 s');
    expect(formatClockOffset(-120_000)).toBe('−2 min');
    expect(formatClockOffset(3 * 3_600_000 + 5 * 60_000)).toBe('+3 h 5 min');
    expect(formatClockOffset(-27 * 3_600_000)).toBe('−1 d 3 h');
  });
});
