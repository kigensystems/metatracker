import type { Context } from "@netlify/functions";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { getScheduledSlot } from "./_shared/sync-health";
import { withRetries, type RetryEvent } from "./_shared/retry";
import {
  enrichTokens,
  fetchBackfillDuneData,
  fetchDuneExecutionData,
  fetchDuneExecutionStatus,
  getDuneStatusCode,
  getErrorMessage,
  isDuneExecutionPendingError,
  isRetryableSyncError,
} from "./_shared/token-sync";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-refresh-token",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const parsed = await request.json();
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readValue(payload: Record<string, unknown>, params: URLSearchParams, key: string): string | undefined {
  const payloadValue = payload[key];
  if (typeof payloadValue === "string") return payloadValue;
  if (typeof payloadValue === "number" || typeof payloadValue === "boolean") return String(payloadValue);
  return params.get(key) || undefined;
}

function readBoolean(payload: Record<string, unknown>, params: URLSearchParams, key: string, defaultValue = false): boolean {
  const value = readValue(payload, params, key);
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1" || value === "yes";
}

function assertDate(value: string | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must be provided as YYYY-MM-DD");
  }

  return value;
}

function parseSlotHour(value: string | undefined): 0 | 12 | undefined {
  if (value === undefined || value === "") return undefined;
  const numeric = Number(value);
  if (numeric === 0 || numeric === 12) return numeric;
  throw new Error("slotHour must be 0 or 12");
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildWindow(date: string, slotHour: 0 | 12 | undefined) {
  const startHour = slotHour ?? 0;
  const windowStartDate = new Date(`${date}T${String(startHour).padStart(2, "0")}:00:00.000Z`);
  const windowEndDate = addHours(windowStartDate, slotHour === undefined ? 24 : 12);

  return {
    snapshotDate: date,
    windowStart: windowStartDate.toISOString(),
    windowEnd: windowEndDate.toISOString(),
    slot: getScheduledSlot(windowStartDate),
  };
}

function isTerminalExecutionFailure(state: string): boolean {
  return state === "QUERY_STATE_FAILED"
    || state === "QUERY_STATE_CANCELED"
    || state === "QUERY_STATE_CANCELLED"
    || state === "QUERY_STATE_EXPIRED"
    || state === "QUERY_STATE_COMPLETED_PARTIAL";
}

function logRetry(stage: string, event: RetryEvent) {
  console.warn(
    `${stage} failed on attempt ${event.attempt}/${event.attempts}; retrying in ${event.delayMs}ms:`,
    event.error,
  );
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  const adminRefreshToken = process.env.ADMIN_REFRESH_TOKEN;
  if (!adminRefreshToken || request.headers.get("x-admin-refresh-token") !== adminRefreshToken) {
    return json({ error: "backfill requires admin authorization" }, 403);
  }

  const duneApiKey = process.env.DUNE_API_KEY;
  const convexUrl = process.env.CONVEX_URL;
  const backfillQueryId = process.env.DUNE_BACKFILL_QUERY_ID;

  if (!duneApiKey || !convexUrl || !backfillQueryId) {
    return json({
      error: "Missing config",
      required: ["DUNE_API_KEY", "CONVEX_URL", "DUNE_BACKFILL_QUERY_ID"],
    }, 500);
  }

  const payload = await readPayload(request);
  const params = new URL(request.url).searchParams;
  const date = assertDate(readValue(payload, params, "date"));
  const slotHour = parseSlotHour(readValue(payload, params, "slotHour"));
  const replaceExisting = readBoolean(payload, params, "replaceExisting", false);
  const allowPartialOverwrite = readBoolean(payload, params, "allowPartialOverwrite", false);
  const dryRun = readBoolean(payload, params, "dryRun", false);
  const executionId = readValue(payload, params, "executionId");
  const window = buildWindow(date, slotHour);
  const convex = new ConvexHttpClient(convexUrl);

  const [existingSnapshot, existingTokens] = await Promise.all([
    convex.query(api.dailySnapshots.byDate, { date: window.snapshotDate }),
    convex.query(api.graduatedTokens.byDate, { date: window.snapshotDate }),
  ]);
  const hasGoodExistingSnapshot = existingTokens.length > 0 && (existingSnapshot?.tokenCount ?? existingTokens.length) > 0;

  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      date: window.snapshotDate,
      slotHour: slotHour ?? null,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      existingTokenCount: existingTokens.length,
      existingSnapshot,
      wouldSkipExisting: hasGoodExistingSnapshot && !replaceExisting,
      backfillQueryId,
    });
  }

  if (hasGoodExistingSnapshot && !replaceExisting) {
    return json({
      ok: true,
      skipped: true,
      reason: "snapshot-exists",
      date: window.snapshotDate,
      existingTokenCount: existingTokens.length,
      existingSnapshot,
    });
  }

  let retryCount = 0;
  const runWithRetry = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
    const result = await withRetries(operation, {
      attempts: 3,
      initialDelayMs: 750,
      maxDelayMs: 5_000,
      shouldRetry: (error) => !isDuneExecutionPendingError(error) && isRetryableSyncError(error),
      onRetry: (event) => logRetry(stage, event),
    });
    retryCount += result.retryCount;
    return result.value;
  };

  try {
    let duneResult;

    if (executionId) {
      const status = await fetchDuneExecutionStatus(duneApiKey, executionId);
      if (status.state !== "QUERY_STATE_COMPLETED") {
        if (isTerminalExecutionFailure(status.state)) {
          throw new Error(`Dune execution ${executionId} ended as ${status.state}: ${status.error?.message || "no error detail"}`);
        }

        return json({
          ok: false,
          pending: true,
          executionId,
          state: status.state,
          date: window.snapshotDate,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
        }, 202);
      }

      duneResult = await runWithRetry(
        "Fetch Dune backfill execution result",
        () => fetchDuneExecutionData(
          duneApiKey,
          executionId,
          backfillQueryId,
          window.windowStart,
          window.windowEnd,
        ),
      );
    } else {
      try {
        duneResult = await runWithRetry(
          "Execute Dune backfill query",
          () => fetchBackfillDuneData(
            duneApiKey,
            backfillQueryId,
            window.windowStart,
            window.windowEnd,
          ),
        );
      } catch (error) {
        if (isDuneExecutionPendingError(error)) {
          return json({
            ok: false,
            pending: true,
            executionId: error.executionId,
            state: error.state,
            date: window.snapshotDate,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            nextStep: "POST again with the same date/window and executionId after the Dune execution completes.",
          }, 202);
        }

        throw error;
      }
    }

    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneResult.tokens);
    const startedAt = Date.now();
    const syncRunId = await convex.mutation(api.syncRuns.start, {
      queryId: backfillQueryId,
      ...window.slot,
      startedAt,
      trigger: "admin-backfill",
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    });

    try {
      const storeResult = await runWithRetry(
        "Store backfilled Convex snapshot",
        () => convex.mutation(api.graduatedTokens.storeSnapshot, {
          date: window.snapshotDate,
          executionEndedAt: duneResult.executionEndedAt,
          tokens: enrichedTokens,
          sourceMetadata: duneResult.sourceMetadata,
          allowHistorical: true,
          replaceExisting,
          allowPartialOverwrite,
          minExistingTokenRetentionRatio: 0.5,
        }),
      );

      await convex.mutation(api.syncRuns.markSuccess, {
        id: syncRunId,
        endedAt: Date.now(),
        retryCount,
        duneStatusCode: duneResult.sourceMetadata.responseStatusCode,
        duneExecutionId: duneResult.sourceMetadata.executionId,
        duneExecutionEndedAt: duneResult.executionEndedAt,
        duneState: duneResult.sourceMetadata.state,
        duneRowCount: duneResult.sourceMetadata.rowCount,
        duneTotalRowCount: duneResult.sourceMetadata.totalRowCount,
        duneResultSizeBytes: duneResult.sourceMetadata.resultSizeBytes,
        sourceQueryKind: duneResult.sourceMetadata.sourceQueryKind,
        snapshotDate: window.snapshotDate,
        tokenCount: duneResult.tokens.length,
        enrichedCount: enrichedTokens.length,
        enrichmentFailedCount: failedEnrichments.length,
        enrichmentSuccessRate: enrichmentRate,
      });

      return json({
        ok: true,
        date: window.snapshotDate,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        executionId: duneResult.sourceMetadata.executionId,
        tokenCount: duneResult.tokens.length,
        enrichedCount: enrichedTokens.length,
        retryCount,
        storeResult,
        sourceMetadata: duneResult.sourceMetadata,
        enrichment: {
          failedCount: failedEnrichments.length,
          successRate: enrichmentRate,
        },
      });
    } catch (error) {
      await convex.mutation(api.syncRuns.markFailure, {
        id: syncRunId,
        endedAt: Date.now(),
        retryCount,
        duneStatusCode: getDuneStatusCode(error),
        errorMessage: getErrorMessage(error).slice(0, 2000),
      });
      throw error;
    }
  } catch (error) {
    console.error("Backfill failed:", error);
    return json({
      ok: false,
      error: "Backfill failed",
      details: String(error),
      retryCount,
    }, 500);
  }
}
