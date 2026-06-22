export interface SyncRunLike {
  slot: string;
  startedAt: number;
  status: string;
}

// Scheduled sync runs every 2 hours (00:00, 02:00, … 22:00 UTC).
export const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const SYNC_GRACE_MS = 30 * 60 * 1000;
// Health tolerates a single missed run before alerting: two intervals + grace.
export const SYNC_STALE_AFTER_MS = 2 * SYNC_INTERVAL_MS + SYNC_GRACE_MS;

// Buckets a timestamp into its 2-hour cron slot, used to label each sync run.
export function getScheduledSlot(date: Date): { slot: string; slotDate: string; slotHour: number } {
  const slotHour = Math.floor(date.getUTCHours() / 2) * 2;
  const slotDate = date.toISOString().split('T')[0];
  const slotTime = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    slotHour,
    0,
    0,
    0,
  ));

  return {
    slot: slotTime.toISOString(),
    slotDate,
    slotHour,
  };
}

export function getLatestSuccessfulRun<Run extends SyncRunLike>(runs: Run[]): Run | null {
  let latest: Run | null = null;
  for (const run of runs) {
    if (run.status === 'success' && (latest === null || run.startedAt > latest.startedAt)) {
      latest = run;
    }
  }
  return latest;
}

export function getSyncAgeMs(latestSuccess: SyncRunLike | null, now: number): number | null {
  if (!latestSuccess) return null;
  return Math.max(0, now - latestSuccess.startedAt);
}

// Healthy when a sync has succeeded within the stale window. Returns false until
// the first successful run is recorded. This is cadence-agnostic: it asks "did a
// sync succeed recently?" rather than auditing fixed per-slot expectations, so it
// never false-alarms on historical slots after a cadence change.
export function isHealthOk(latestSuccess: SyncRunLike | null, now: number): boolean {
  const age = getSyncAgeMs(latestSuccess, now);
  return age !== null && age <= SYNC_STALE_AFTER_MS;
}
