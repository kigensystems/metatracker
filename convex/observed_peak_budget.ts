export interface RequestBudgetInput {
  used: number;
  requested: number;
  limit: number;
}

export function getMonthlyRequestPeriod(now: number): string {
  if (!Number.isFinite(now) || now <= 0) {
    throw new Error("A valid timestamp is required for the request budget period");
  }

  return new Date(now).toISOString().slice(0, 7);
}

export function grantProviderRequests({ used, requested, limit }: RequestBudgetInput) {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeRequested = Math.max(0, Math.floor(requested));
  const safeLimit = Math.max(0, Math.floor(limit));
  const remainingBefore = Math.max(0, safeLimit - safeUsed);
  const granted = Math.min(safeRequested, remainingBefore);
  const usedAfter = safeUsed + granted;

  return {
    granted,
    usedAfter,
    remaining: Math.max(0, safeLimit - usedAfter),
  };
}
