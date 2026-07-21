export interface SyncRunLike {
  slot: string;
  startedAt: number;
  endedAt?: number;
  status: string;
  duneExecutionEndedAt?: string;
}

// Scheduled sync runs every 2 hours (00:00, 02:00, … 22:00 UTC).
export const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const SYNC_GRACE_MS = 30 * 60 * 1000;
// Health tolerates a single missed run before alerting: two intervals + grace.
export const SYNC_STALE_AFTER_MS = 2 * SYNC_INTERVAL_MS + SYNC_GRACE_MS;
// The source query normally re-executes every 1-3 hours. Allow three app sync
// intervals plus grace before treating a completed-but-old Dune result as stale.
export const DUNE_STALE_AFTER_MS = 3 * SYNC_INTERVAL_MS + SYNC_GRACE_MS;

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
    const runCompletedAt = run.endedAt ?? run.startedAt;
    const latestCompletedAt = latest ? latest.endedAt ?? latest.startedAt : -Infinity;
    if (run.status === 'success' && runCompletedAt > latestCompletedAt) {
      latest = run;
    }
  }
  return latest;
}

export function getSyncAgeMs(latestSuccess: SyncRunLike | null, now: number): number | null {
  if (!latestSuccess) return null;
  return Math.max(0, now - (latestSuccess.endedAt ?? latestSuccess.startedAt));
}

export function getDuneAgeMs(latestSuccess: SyncRunLike | null, now: number): number | null {
  if (!latestSuccess?.duneExecutionEndedAt) return null;
  const executionEndedAt = Date.parse(latestSuccess.duneExecutionEndedAt);
  if (!Number.isFinite(executionEndedAt)) return null;
  return Math.max(0, now - executionEndedAt);
}

// Healthy only when both the app sync and the Dune execution it consumed are
// recent. This stays cadence-agnostic while preventing a repeatedly downloaded
// old Dune result from keeping the monitor green indefinitely.
export function isHealthOk(latestSuccess: SyncRunLike | null, now: number): boolean {
  const syncAge = getSyncAgeMs(latestSuccess, now);
  const duneAge = getDuneAgeMs(latestSuccess, now);
  return syncAge !== null
    && syncAge <= SYNC_STALE_AFTER_MS
    && duneAge !== null
    && duneAge <= DUNE_STALE_AFTER_MS;
}
