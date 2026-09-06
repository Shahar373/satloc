/** "MM-DD HH:MM" of a UTC instant, for compact pass and opportunity rows. */
export function formatUtcShort(date: Date): string {
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

const pad2 = (n: number) => n.toString().padStart(2, '0');

/**
 * Local date and time next to a UTC one, in the same "MM-DD HH:MM" shape (not the system locale,
 * which would mix day/month order or bidi marks into the row). The date is included because around
 * midnight the local calendar day differs from the UTC one printed beside it.
 */
export function formatLocalDateTime(date: Date): string {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Local time to print beside a UTC "MM-DD HH:MM": just "HH:MM" when both fall on the same
 * calendar day, "MM-DD HH:MM" when the local day differs (around midnight).
 */
export function formatLocalBeside(date: Date): string {
  const sameDay = date.getUTCMonth() === date.getMonth() && date.getUTCDate() === date.getDate();
  return sameDay ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : formatLocalDateTime(date);
}

/** Signed, human-sized offset such as "+2 min", "−1 d 3 h", "+45 s". */
export function formatClockOffset(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  const abs = Math.abs(ms);
  const s = Math.round(abs / 1000);
  if (s < 90) return `${sign}${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${sign}${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${sign}${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `${sign}${d} d${h % 24 ? ` ${h % 24} h` : ''}`;
}

/** Age of a timestamp as "3 h", "2.5 d" or "just now". */
export function formatAgeSince(date: Date, now = new Date()): string {
  const ms = Math.max(0, now.getTime() - date.getTime());
  const hours = ms / 3_600_000;
  if (hours < 1 / 60) return 'just now';
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${(hours / 24).toFixed(1)} d ago`;
}

/** "m:ss min" from seconds, rounding to whole seconds first so 5:59.6 reads 6:00 and never "5:60". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')} min`;
}
