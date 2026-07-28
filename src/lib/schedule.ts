// When the two background jobs are next due. These mirror the cron strings in
// netlify/functions/*.ts and are predictions from the schedule, not observed
// runs — a job can start late or fail, so the UI labels them as "due", never
// as a promise that fresh data has landed.
//
//   scheduled-sync  "0 */2 * * *"  → every even UTC hour, on the hour
//   peak-backfill   "20 * * * *"   → every UTC hour, at :20

/** Next even UTC hour on the hour, strictly after `from`. */
export function nextDuneSync(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  if (next.getUTCHours() % 2 !== 0) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** Next UTC :20, strictly after `from`. */
export function nextPeakRead(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(20, 0, 0);
  if (next <= from) next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** "1h 12m", "12m", "48s" — coarse above a minute, live below it. */
export function formatCountdown(target: Date, from: Date = new Date()): string {
  const totalSeconds = Math.max(0, Math.round((target.getTime() - from.getTime()) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
