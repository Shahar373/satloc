/**
 * A minimal ULID (https://github.com/ulid/spec) generator: a 48-bit millisecond timestamp
 * followed by 80 bits of randomness, Crockford Base32-encoded to 26 characters. Lexicographic
 * sort order matches creation order (for the timestamp portion) without needing a database
 * sequence, which is what makes it a good fit for `EventEnvelope.recordId` — unique and
 * roughly time-ordered across sessions, unlike `globalSequence`, which only orders records
 * within one session.
 *
 * Implemented in-house rather than adding a dependency: the algorithm is small, stable, and
 * exactly specified, and this keeps `src/contracts/` (like `src/core/`) free of runtime
 * dependencies beyond the platform's own `crypto` global.
 */

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIMESTAMP_CHARS = 10;
const RANDOM_CHARS = 16;
const RANDOM_BYTES = 10; // 80 bits, encoded as 16 base32 characters (5 bits each)

function encodeTimestamp(ms: number): string {
  let chars = '';
  let remaining = ms;
  for (let i = TIMESTAMP_CHARS - 1; i >= 0; i--) {
    chars = CROCKFORD_ALPHABET[remaining % 32] + chars;
    remaining = Math.floor(remaining / 32);
  }
  return chars;
}

function encodeRandom(bytes: Uint8Array): string {
  // 80 bits (10 bytes) don't divide evenly into 5-bit groups (16 * 5 = 80, so they do here),
  // so this walks a bit cursor across the byte array rather than assuming byte alignment.
  let chars = '';
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (let i = 0; i < RANDOM_CHARS; i++) {
    while (bitCount < 5) {
      bitBuffer = (bitBuffer << 8) | bytes[byteIndex++]!;
      bitCount += 8;
    }
    bitCount -= 5;
    chars += CROCKFORD_ALPHABET[(bitBuffer >> bitCount) & 0x1f];
  }
  return chars;
}

/** A fresh 26-character ULID. `now` and `randomBytes` are injectable for deterministic tests. */
export function generateUlid(now: Date = new Date(), randomBytes?: Uint8Array): string {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(RANDOM_BYTES));
  if (bytes.length !== RANDOM_BYTES) {
    throw new Error(`generateUlid: randomBytes must be exactly ${RANDOM_BYTES} bytes, got ${bytes.length}`);
  }
  return encodeTimestamp(now.getTime()) + encodeRandom(bytes);
}
