export const TOKEN_DISPLAY_TIME_ZONE = "America/Los_Angeles";

export interface TokenDateLike {
  mint: string;
  createdAt?: number | null;
  snapshotDate?: string;
  snapshotCapturedAt?: number;
  _creationTime?: number;
}

export interface TokenDateCount {
  date: string;
  tokenCount: number;
  capturedAt: number;
}

function getDateParts(timestamp: number, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getTokenDisplayDate(timestamp: number | null | undefined, timeZone = TOKEN_DISPLAY_TIME_ZONE): string | null {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return null;
  }

  const parts = getDateParts(timestamp, timeZone);
  if (!parts.year || !parts.month || !parts.day) {
    return null;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function isNewerStoredToken<T extends TokenDateLike>(candidate: T, current: T): boolean {
  const candidateSnapshot = candidate.snapshotDate || "";
  const currentSnapshot = current.snapshotDate || "";

  if (candidateSnapshot !== currentSnapshot) {
    return candidateSnapshot > currentSnapshot;
  }

  return (candidate._creationTime || 0) > (current._creationTime || 0);
}

export function dedupeTokensByMint<T extends TokenDateLike>(tokens: T[]): T[] {
  const byMint = new Map<string, T>();

  for (const token of tokens) {
    const current = byMint.get(token.mint);
    if (!current || isNewerStoredToken(token, current)) {
      byMint.set(token.mint, token);
    }
  }

  return Array.from(byMint.values());
}

export function filterTokensByDisplayDate<T extends TokenDateLike>(
  tokens: T[],
  date: string,
  timeZone = TOKEN_DISPLAY_TIME_ZONE,
): T[] {
  return dedupeTokensByMint(tokens)
    .filter((token) => getTokenDisplayDate(token.createdAt, timeZone) === date)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function buildTokenDateCounts<T extends TokenDateLike>(
  tokens: T[],
  timeZone = TOKEN_DISPLAY_TIME_ZONE,
): TokenDateCount[] {
  const countsByDate = new Map<string, TokenDateCount>();

  for (const token of dedupeTokensByMint(tokens)) {
    const date = getTokenDisplayDate(token.createdAt, timeZone);
    if (!date) continue;

    const current = countsByDate.get(date);
    countsByDate.set(date, {
      date,
      tokenCount: (current?.tokenCount || 0) + 1,
      capturedAt: Math.max(current?.capturedAt || 0, token.snapshotCapturedAt || token._creationTime || 0),
    });
  }

  return Array.from(countsByDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}
