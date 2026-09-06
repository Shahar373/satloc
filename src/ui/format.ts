/** "MM-DD HH:MM" of a UTC instant, for compact pass and opportunity rows. */
export function formatUtcShort(date: Date): string {
  return date.toISOString().slice(5, 16).replace('T', ' ');
}

/**
 * Local date and time next to a UTC one: the date is included because around midnight the
 * local calendar day differs from the UTC one printed beside it.
 */
export function formatLocalDateTime(date: Date): string {
  return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
