import { describe, expect, it } from 'vitest';
import { describeCelestrakFailure } from './catalog';

describe('describeCelestrakFailure', () => {
  it('explains the common failures in plain words', () => {
    expect(describeCelestrakFailure('HTTP 403 Forbidden for https://celestrak.org/...')).toMatch(/temporary block/);
    expect(describeCelestrakFailure('HTTP 404 Not Found for ...')).toMatch(/no record/);
    expect(describeCelestrakFailure('Failed to fetch')).toMatch(/could not be reached/);
    expect(describeCelestrakFailure('something odd')).toMatch(/CelesTrak failed \(something odd\)/);
  });
});
