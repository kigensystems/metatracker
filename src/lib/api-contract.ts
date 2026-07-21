import type { DataFreshness, GraduatedToken } from './types.js';

interface ParsedGraduatedPayload {
  tokens: GraduatedToken[];
  updatedAt: Date;
  freshness: DataFreshness;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildFreshness(data: Record<string, unknown>, totalCount: number): DataFreshness {
  const enrichmentData = isRecord(data.enrichment) ? data.enrichment : null;
  const enrichment = enrichmentData
    ? {
        failedCount: numberOrNull(enrichmentData.failedCount) ?? 0,
        successRate: numberOrNull(enrichmentData.successRate) ?? 0,
      }
    : null;

  const source = stringOrNull(data.source);
  const isStale = Boolean(data.isStale) || source === 'cache-stale';

  return {
    source,
    snapshotDate: stringOrNull(data.snapshotDate),
    fetchedAt: stringOrNull(data.fetchedAt),
    capturedAt: numberOrNull(data.capturedAt),
    duneExecutionEndedAt: stringOrNull(data.duneExecutionEndedAt),
    latestDuneExecutionEndedAt: stringOrNull(data.latestDuneExecutionEndedAt),
    isStale,
    staleReason: stringOrNull(data.staleReason),
    dateMode: stringOrNull(data.dateMode),
    totalCount: numberOrNull(data.totalCount) ?? totalCount,
    enrichment,
  };
}

/**
 * Reads both current and future additive /api/graduated payloads. Token objects
 * remain intact so a later frontend can consume optional fields without making
 * old live or historical responses invalid.
 */
export function parseGraduatedPayload(value: unknown, now = Date.now()): ParsedGraduatedPayload {
  const data = isRecord(value) ? value : {};
  const tokens = Array.isArray(data.tokens) ? data.tokens as GraduatedToken[] : [];
  const updatedAtValue = data.fetchedAt || data.capturedAt || now;

  return {
    tokens,
    updatedAt: new Date(updatedAtValue as string | number),
    freshness: buildFreshness(data, tokens.length),
  };
}
