import type { Config, Context } from "@netlify/functions";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getScheduledSlot } from "./_shared/sync-health";
import { withRetries, type RetryEvent } from "./_shared/retry";
import {
  DEFAULT_DUNE_QUERY_ID,
  enrichTokens,
  fetchLatestDuneData,
  getDuneStatusCode,
  getErrorMessage,
  isRetryableSyncError,
} from "./_shared/token-sync";

const QUERY_ID = DEFAULT_DUNE_QUERY_ID;
const SYNC_RETRY_ATTEMPTS = 3;

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

export default async function handler(_request: Request, _context: Context) {
  console.log("Scheduled sync started at", new Date().toISOString());

  const duneApiKey = process.env.DUNE_API_KEY;
  const convexUrl = process.env.CONVEX_URL;

  if (!duneApiKey || !convexUrl) {
    console.error("Missing required environment variables");
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

    try {
      const startResult = await withRetries(
        () => convex.mutation(api.syncRuns.start, {
          queryId: QUERY_ID,
          ...slot,
          startedAt,
          trigger: "scheduled",
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

    console.log("Fetching from Dune...");
    const duneResult = await runWithRetry(
      "Fetch Dune latest result",
      () => fetchLatestDuneData(duneApiKey, QUERY_ID),
    );
    const sourceMetadata = duneResult.sourceMetadata;
    console.log(`Got ${duneResult.tokens.length} tokens from Dune`);

    console.log("Enriching tokens with DexScreener...");
    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneResult.tokens);
    console.log(`Enriched ${enrichedTokens.length} tokens (${enrichmentRate.toFixed(1)}% success rate)`);
    if (failedEnrichments.length > 0) {
      console.log(`Failed to enrich ${failedEnrichments.length} tokens from DexScreener`);
    }

    console.log("Storing in Convex...");
    await runWithRetry(
      "Store Convex snapshot",
      () => convex.mutation(api.graduatedTokens.storeSnapshot, {
        date: today,
        executionEndedAt: duneResult.executionEndedAt,
        tokens: enrichedTokens,
        sourceMetadata,
        replaceExisting: true,
        minExistingTokenRetentionRatio: 0.5,
      }),
    );

    await runWithRetry(
      "Update Dune metadata",
      () => convex.mutation(api.duneMetadata.update, {
        queryId: QUERY_ID,
        lastExecutionEndedAt: duneResult.executionEndedAt,
        lastFetchedAt: Date.now(),
        totalRowCount: sourceMetadata.totalRowCount,
        lastExecutionId: sourceMetadata.executionId,
        lastDuneState: sourceMetadata.state,
        lastResponseStatusCode: sourceMetadata.responseStatusCode,
        lastRowCount: sourceMetadata.rowCount,
        lastResultSizeBytes: sourceMetadata.resultSizeBytes,
      }),
    );

    if (syncRunId) {
      try {
        await convex.mutation(api.syncRuns.markSuccess, {
          id: syncRunId,
          endedAt: Date.now(),
          retryCount,
          duneStatusCode: sourceMetadata.responseStatusCode,
          duneExecutionId: sourceMetadata.executionId,
          duneExecutionEndedAt: duneResult.executionEndedAt,
          duneState: sourceMetadata.state,
          duneRowCount: sourceMetadata.rowCount,
          duneTotalRowCount: sourceMetadata.totalRowCount,
          duneResultSizeBytes: sourceMetadata.resultSizeBytes,
          sourceQueryKind: sourceMetadata.sourceQueryKind,
          snapshotDate: today,
          tokenCount: duneResult.tokens.length,
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
      executionEndedAt: duneResult.executionEndedAt,
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

// Run every 2 hours (at 00:00, 02:00, … 22:00 UTC) to keep the stored snapshot
// close to Dune's latest execution. Background function allows up to 15 minutes.
export const config: Config & { type: "background" } = {
  schedule: "0 */2 * * *",
  type: "background",
};
