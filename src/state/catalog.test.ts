import { describe, expect, it } from 'vitest';
import { ageMs, describeCelestrakFailure } from './catalog';

describe('describeCelestrakFailure', () => {
  it('explains the common failures in plain words', () => {
    expect(describeCelestrakFailure('HTTP 403 Forbidden for https://celestrak.org/...')).toMatch(/temporary block/);
    expect(describeCelestrakFailure('HTTP 404 Not Found for ...')).toMatch(/no record/);
    expect(describeCelestrakFailure('Failed to fetch')).toMatch(/could not be reached/);
    expect(describeCelestrakFailure('something odd')).toMatch(/CelesTrak failed \(something odd\)/);
  });
});

describe('describeCelestrakFailure wording', () => {
  it('recognises the timeout and reqwest messages seen on Windows', () => {
    expect(describeCelestrakFailure('Timed out after 20 s for https://celestrak.org/x')).toMatch(/could not be reached/);
    expect(describeCelestrakFailure('error sending request for url (https://celestrak.org/x)')).toMatch(/could not be reached/);
    expect(describeCelestrakFailure('HTTP 404 Not Found for x', 'this group')).toMatch(/no record for this group/);
    expect(describeCelestrakFailure('CelesTrak returned a web page instead of data (captive portal or block?)')).toMatch(/web page/);
  });
});

describe('ageMs', () => {
  it('treats a timestamp in the future as infinitely old', () => {
    const now = Date.parse('2026-09-06T12:00:00Z');
    expect(ageMs(new Date('2026-09-06T11:00:00Z'), now)).toBe(3_600_000);
    expect(ageMs(new Date('2026-09-06T13:00:00Z'), now)).toBe(Number.POSITIVE_INFINITY);
    expect(ageMs(null, now)).toBe(Number.POSITIVE_INFINITY);
  });
});
