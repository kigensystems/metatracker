export interface ExpectedSlot {
  slot: string;
  slotDate: string;
  slotHour: number;
  cutoffAt: string;
  due: boolean;
}

export interface SyncRunLike {
  slot: string;
  startedAt: number;
  status: string;
}

export interface ExpectedSlotStatus<Run extends SyncRunLike> extends ExpectedSlot {
  monitored: boolean;
  runs: Run[];
  run: Run | null;
  status: string;
  hasSuccess: boolean;
}

export const SLOT_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const SLOT_GRACE_MS = 30 * 60 * 1000;

export function getScheduledSlot(date: Date): { slot: string; slotDate: string; slotHour: number } {
  const slotHour = date.getUTCHours() < 12 ? 0 : 12;
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

export function getCurrentSlotStart(now: Date): Date {
  return new Date(getScheduledSlot(now).slot);
}

export function getRecentExpectedSlots(now: Date, count: number): ExpectedSlot[] {
  const currentSlotStart = getCurrentSlotStart(now);

  return Array.from({ length: count }, (_, index) => {
    const slotStart = new Date(currentSlotStart.getTime() - index * SLOT_INTERVAL_MS);
    const cutoff = new Date(slotStart.getTime() + SLOT_GRACE_MS);

    return {
      slot: slotStart.toISOString(),
      slotDate: slotStart.toISOString().split('T')[0],
      slotHour: slotStart.getUTCHours(),
      cutoffAt: cutoff.toISOString(),
      due: now.getTime() >= cutoff.getTime(),
    };
  });
}

export function buildExpectedSlotStatuses<Run extends SyncRunLike>(
  expectedSlots: ExpectedSlot[],
  slotRuns: Run[],
  oldestRun: Run | null,
): ExpectedSlotStatus<Run>[] {
  const runsBySlot = new Map<string, Run[]>();
  for (const run of slotRuns) {
    const runs = runsBySlot.get(run.slot) || [];
    runs.push(run);
    runsBySlot.set(run.slot, runs);
  }

  return expectedSlots.map((slot) => {
    const runs = runsBySlot.get(slot.slot) || [];
    const latestRunForSlot = [...runs].sort((a, b) => b.startedAt - a.startedAt)[0] || null;
    const hasSuccess = runs.some((run) => run.status === 'success');
    const monitored = oldestRun
      ? runs.length > 0 || new Date(slot.cutoffAt).getTime() >= oldestRun.startedAt
      : false;

    return {
      ...slot,
      monitored,
      runs,
      run: latestRunForSlot,
      status: latestRunForSlot?.status || 'missing',
      hasSuccess,
    };
  });
}

export function getMissingDueSlots<Run extends SyncRunLike>(
  expectedSlots: ExpectedSlotStatus<Run>[],
): ExpectedSlotStatus<Run>[] {
  return expectedSlots.filter((slot) => slot.monitored && slot.due && !slot.hasSuccess);
}

export function isHealthOk<Run extends SyncRunLike>(
  oldestRun: Run | null,
  missingDueSlots: ExpectedSlotStatus<Run>[],
): boolean {
  return Boolean(oldestRun) && missingDueSlots.length === 0;
}
