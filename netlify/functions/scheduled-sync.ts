import type { Config, Context } from "@netlify/functions";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getScheduledSlot } from "./_shared/sync-health";
import { withRetries, type RetryEvent } from "./_shared/retry";
import {
  PUMP_DISCOVERY_WINDOW_MS,
  PUMP_PEAK_SOURCE,
  PUMP_SOURCE_ID,
  enrichTokens,
  fetchGraduatedFromPumpFun,
  getDuneStatusCode,
  getErrorMessage,
  isRetryableSyncError,
} from "./_shared/token-sync";

const SYNC_RETRY_ATTEMPTS = 3;
/**
 * Persist peaks in batches so partial progress survives a timeout, but not so
 * small that a full cohort costs hundreds of sequential round trips. At ~1,000
 * tokens this is ~20 mutations, each well inside Convex's transaction limits.
 */
const PEAK_RECORD_BATCH_SIZE = 50;

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function logRetry(stage: string, event: RetryEvent) {
  console.warn(
    `${stage} failed on attempt ${event.attempt}/${event.attempts}; retrying in ${event.delayMs}ms:`,
    event.error,
  );
}

async function markSyncFailure(
  convex: ConvexHttpClient,
  syncRunId: Id<"syncRuns"> | null,
  error: unknown,
  retryCount: number,
) {
  if (!syncRunId) return;

  try {
    await convex.mutation(api.syncRuns.markFailure, {
      id: syncRunId,
      endedAt: Date.now(),
      retryCount,
      duneStatusCode: getDuneStatusCode(error),
      errorMessage: getErrorMessage(error).slice(0, 2000),
    });
  } catch (markError) {
    console.error("Failed to record sync failure:", markError);
  }
}

/**
 * The most recent creation time in the page, as the feed's own freshness.
 *
 * pump.fun has no execution timestamp to inherit, and a frozen or cached feed
 * would otherwise look like a healthy sync — the failure that let a stale Dune
 * query go unnoticed for months. Graduations arrive tens per hour, so this
 * reading falling hours behind means the source stopped moving.
 */
function newestCreatedAt(createdAt: Map<string, number>, fallback: number): number {
  let newest = 0;
  for (const created of createdAt.values()) {
    if (created > newest) newest = created;
  }
  return newest || fallback;
}

export default async function handler(_request: Request, _context: Context) {
  console.log("Scheduled sync started at", new Date().toISOString());

  const convexUrl = process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error("CONVEX_URL is not configured");
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  let syncRunId: Id<"syncRuns"> | null = null;
  let retryCount = 0;

  const runWithRetry = async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
    const result = await withRetries(operation, {
      attempts: SYNC_RETRY_ATTEMPTS,
      initialDelayMs: 750,
      maxDelayMs: 5_000,
      shouldRetry: isRetryableSyncError,
      onRetry: (event) => logRetry(stage, event),
    });
    retryCount += result.retryCount;
    return result.value;
  };

  try {
    const startedAt = Date.now();
    const slot = getScheduledSlot(new Date(startedAt));
    const today = getTodayUTC();
    const windowStart = new Date(startedAt - PUMP_DISCOVERY_WINDOW_MS).toISOString();

    try {
      const startResult = await withRetries(
        () => convex.mutation(api.syncRuns.start, {
          queryId: PUMP_SOURCE_ID,
          ...slot,
          startedAt,
          trigger: "scheduled",
          windowStart,
        }),
        {
          attempts: 2,
          initialDelayMs: 500,
          maxDelayMs: 1_500,
          shouldRetry: () => true,
          onRetry: (event) => logRetry("Record sync start", event),
        },
      );
      syncRunId = startResult.value;
      retryCount += startResult.retryCount;
    } catch (error) {
      console.error("Failed to record sync start:", error);
    }

    console.log("Fetching the graduated feed from pump.fun...");
    const pumpResult = await runWithRetry(
      "Fetch pump.fun graduated feed",
      () => fetchGraduatedFromPumpFun(PUMP_DISCOVERY_WINDOW_MS),
    );
    console.log(
      `Got ${pumpResult.tokens.length} graduated tokens from ${pumpResult.pagesFetched} pages`,
    );

    // An empty feed is a source failure, not a day with no graduations: pump.fun
    // produces ~1,000 a day. Failing here leaves the stored snapshot untouched
    // rather than recording a successful sync over nothing.
    if (pumpResult.tokens.length === 0) {
      throw new Error("pump.fun returned no graduated tokens; refusing to record an empty sync");
    }

    // A page that failed part-way through the walk truncates the cohort by an
    // unknown amount. Storing that would look like a quiet day rather than a
    // broken fetch, so the run fails and the previous snapshot stands.
    if (!pumpResult.complete) {
      throw new Error(
        `pump.fun paging stopped after ${pumpResult.pagesFetched} pages without reaching the `
        + `${PUMP_DISCOVERY_WINDOW_MS / 3_600_000}h cutoff; refusing to store a truncated cohort`,
      );
    }

    console.log("Enriching tokens with DexScreener...");
    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate, peakObservations } =
      await enrichTokens(pumpResult.tokens, {
        pumpMeta: pumpResult.meta,
        createdAt: pumpResult.createdAt,
      });
    console.log(`Enriched ${enrichedTokens.length} tokens (${enrichmentRate.toFixed(1)}% success rate)`);
    if (failedEnrichments.length > 0) {
      console.log(`Failed to enrich ${failedEnrichments.length} tokens from DexScreener`);
    }

    // pump.fun has no execution timestamp, so the capture time is the snapshot's
    // own source time. It only ever moves forward, which is what the store's
    // not-older guard checks.
    const capturedAt = new Date().toISOString();
    const sourceMetadata = {
      queryId: PUMP_SOURCE_ID,
      executionEndedAt: capturedAt,
      responseStatusCode: 200,
      rowCount: pumpResult.tokens.length,
      totalRowCount: pumpResult.tokens.length,
      // No equivalent: the feed is paged, so there is no single result payload.
      resultSizeBytes: 0,
      fetchedAt: Date.now(),
      sourceQueryKind: "latest",
      windowStart,
      windowEnd: capturedAt,
    };

    console.log("Storing in Convex...");
    const storeResult = await runWithRetry(
      "Store Convex snapshot",
      () => convex.mutation(api.graduatedTokens.storeSnapshot, {
        date: today,
        executionEndedAt: capturedAt,
        tokens: enrichedTokens,
        sourceMetadata,
        replaceExisting: true,
        preserveExistingTokens: true,
      }),
    );
    const preservedTokenCount = "preserved" in storeResult ? storeResult.preserved : 0;

    // Peaks are supplementary to the snapshot, so a failure here is logged and
    // the run still counts: the cohort is captured either way.
    let recordedPeaks = 0;
    for (let i = 0; i < peakObservations.length; i += PEAK_RECORD_BATCH_SIZE) {
      const batch = peakObservations.slice(i, i + PEAK_RECORD_BATCH_SIZE);
      try {
        await convex.mutation(api.observedPeaks.record, {
          source: PUMP_PEAK_SOURCE,
          fetchedAt: Date.now(),
          observations: batch,
        });
        recordedPeaks += batch.length;
      } catch (error) {
        console.error(`Failed to record peaks at offset ${i}:`, error);
      }
    }
    console.log(`Recorded ${recordedPeaks}/${peakObservations.length} reported ATHs`);

    if (syncRunId) {
      try {
        await convex.mutation(api.syncRuns.markSuccess, {
          id: syncRunId,
          endedAt: Date.now(),
          retryCount,
          duneStatusCode: sourceMetadata.responseStatusCode,
          // Feed freshness, not an execution time — see newestCreatedAt above.
          duneExecutionEndedAt: new Date(
            newestCreatedAt(pumpResult.createdAt, startedAt),
          ).toISOString(),
          duneRowCount: sourceMetadata.rowCount,
          duneTotalRowCount: sourceMetadata.totalRowCount,
          duneResultSizeBytes: sourceMetadata.resultSizeBytes,
          sourceQueryKind: sourceMetadata.sourceQueryKind,
          snapshotDate: today,
          tokenCount: pumpResult.tokens.length,
          snapshotTokenCount: storeResult.stored,
          enrichedCount: enrichedTokens.length,
          enrichmentFailedCount: failedEnrichments.length,
          enrichmentSuccessRate: enrichmentRate,
        });
      } catch (error) {
        console.error("Failed to record sync success:", error);
      }
    }

    console.log("Sync complete!");

    return new Response(JSON.stringify({
      success: true,
      date: today,
      tokenCount: enrichedTokens.length,
      snapshotTokenCount: storeResult.stored,
      preservedTokenCount,
      pagesFetched: pumpResult.pagesFetched,
      recordedPeaks,
      capturedAt,
      retryCount,
      sourceMetadata,
      enrichment: {
        failedCount: failedEnrichments.length,
        successRate: enrichmentRate,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Scheduled sync failed:", error);
    await markSyncFailure(convex, syncRunId, error, retryCount);
    return new Response(JSON.stringify({
      error: "Sync failed",
      details: String(error),
      retryCount,
    }), { status: 500 });
  }
}

// Run every 2 hours (at 00:00, 02:00, … 22:00 UTC). Background function allows
// up to 15 minutes, which the paced DexScreener enrichment needs at cohort size.
export const config: Config & { type: "background" } = {
  schedule: "0 */2 * * *",
  type: "background",
};
