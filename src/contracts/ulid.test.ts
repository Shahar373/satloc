import { describe, expect, it } from 'vitest';
import { generateUlid } from './ulid';

describe('generateUlid', () => {
  it('produces a 26-character Crockford Base32 string', () => {
    const id = generateUlid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('is deterministic given a fixed timestamp and randomness', () => {
    const now = new Date('2026-09-07T12:00:00.000Z');
    const randomBytes = new Uint8Array(10); // all zero
    const id = generateUlid(now, randomBytes);
    // Timestamp portion is deterministic from the epoch ms; random portion is all zeros -> '0'.
    expect(id.slice(10)).toBe('0000000000000000');
    expect(id).toHaveLength(26);
  });

  it('sorts lexicographically by timestamp for increasing times, same randomness', () => {
    const randomBytes = new Uint8Array(10);
    const earlier = generateUlid(new Date('2026-09-07T12:00:00.000Z'), randomBytes);
    const later = generateUlid(new Date('2026-09-07T12:00:01.000Z'), randomBytes);
    expect(earlier < later).toBe(true);
  });

  it('rejects the wrong number of random bytes', () => {
    expect(() => generateUlid(new Date(), new Uint8Array(4))).toThrow(/10 bytes/);
  });

  it('generates unique ids across many calls (real randomness)', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateUlid()));
    expect(ids.size).toBe(1000);
  });
});
