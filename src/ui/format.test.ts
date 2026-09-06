import { describe, expect, it } from 'vitest';
import { formatAgeSince, formatDuration, formatUtcShort } from './format';

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
