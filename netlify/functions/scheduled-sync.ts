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
  type StoredToken,
} from "./_shared/token-sync";
import {
  derivePeakSupply,
  enrichObservedPeaks,
} from "./_shared/solana-tracker";
import { getMonthlyRequestPeriod } from "../../convex/observed_peak_budget";

const QUERY_ID = DEFAULT_DUNE_QUERY_ID;
const SYNC_RETRY_ATTEMPTS = 3;
const SOLANA_TRACKER_PROVIDER = "solana-tracker";
const SOLANA_TRACKER_MONTHLY_REQUEST_LIMIT = 2_200;
const SOLANA_TRACKER_MAX_REQUESTS_PER_SYNC = 8;

interface PeakLike {
  mint: string;
  observedPeakMarketCap?: number;
  observedPeakFetchedAt?: number;
}

interface PeakRecord {
  mint: string;
  observedPeakMarketCap: number;
  observedPeakAt: number;
  observedPeakPriceUsd: number;
  observedPeakFetchedAt: number;
  observedPeakSource: string;
  observedPeakSupply: number;
  observedPeakSupplySource: string;
}

function hasStoredPeak(token: PeakLike): boolean {
  return token.observedPeakFetchedAt !== undefined
    && token.observedPeakMarketCap !== undefined;
}

function buildPeakCandidates(incoming: StoredToken[], stored: StoredToken[]): StoredToken[] {
  const byMint = new Map<string, StoredToken>();
  for (const token of stored) byMint.set(token.mint, token);
  for (const token of incoming) byMint.set(token.mint, token);

  return [...byMint.values()].sort((left, right) => (
    (left.createdAt ?? Number.MAX_SAFE_INTEGER) - (right.createdAt ?? Number.MAX_SAFE_INTEGER)
  ));
}

function toPeakRecord(token: StoredToken): PeakRecord | null {
  if (
    token.observedPeakMarketCap === undefined
    || token.observedPeakAt === undefined
    || token.observedPeakPriceUsd === undefined
    || token.observedPeakFetchedAt === undefined
    || token.observedPeakSource === undefined
    || token.observedPeakSupply === undefined
    || token.observedPeakSupplySource === undefined
  ) {
    return null;
  }

  return {
    mint: token.mint,
    observedPeakMarketCap: token.observedPeakMarketCap,
    observedPeakAt: token.observedPeakAt,
    observedPeakPriceUsd: token.observedPeakPriceUsd,
    observedPeakFetchedAt: token.observedPeakFetchedAt,
    observedPeakSource: token.observedPeakSource,
    observedPeakSupply: token.observedPeakSupply,
    observedPeakSupplySource: token.observedPeakSupplySource,
  };
}

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function getPreviousUTCDate(now: number): string {
  return new Date(now - (24 * 60 * 60 * 1000)).toISOString().split("T")[0];
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
  const solanaTrackerApiKey = process.env.SOLANA_TRACKER_API_KEY;

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
    const { tokens: dexEnrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneResult.tokens);
    let enrichedTokens = dexEnrichedTokens;
    console.log(`Enriched ${enrichedTokens.length} tokens (${enrichmentRate.toFixed(1)}% success rate)`);
    if (failedEnrichments.length > 0) {
      console.log(`Failed to enrich ${failedEnrichments.length} tokens from DexScreener`);
    }

    const previousDate = getPreviousUTCDate(startedAt);
    const storedPeakTokens = await runWithRetry(
      "Load prior observed peaks",
      async () => {
        const [todayTokens, yesterdayTokens] = await Promise.all([
          convex.query(api.graduatedTokens.byDate, { date: today }),
          convex.query(api.graduatedTokens.byDate, { date: previousDate }),
        ]);
        return [...yesterdayTokens, ...todayTokens];
      },
    );

    const peakCandidates = buildPeakCandidates(enrichedTokens, storedPeakTokens);
    const permanentPeaks = await runWithRetry(
      "Load permanent observed peak cache",
      () => convex.query(api.observedPeaks.byMints, {
        mints: peakCandidates.map((token) => token.mint),
      }),
    );
    const priorPeakTokens = [...storedPeakTokens, ...permanentPeaks];
    const cachedPeakMints = new Set(
      priorPeakTokens.filter(hasStoredPeak).map((token) => token.mint),
    );
    const eligiblePeakCount = peakCandidates.filter((token) => (
      !cachedPeakMints.has(token.mint) && derivePeakSupply(token) !== null
    )).length;
    const peakRequestPeriod = getMonthlyRequestPeriod(startedAt);
    const requestedPeakCalls = solanaTrackerApiKey
      ? Math.min(SOLANA_TRACKER_MAX_REQUESTS_PER_SYNC, eligiblePeakCount)
      : 0;
    const peakBudget = await runWithRetry(
      "Reserve Solana Tracker request budget",
      () => convex.mutation(api.observedPeaks.reserveRequests, {
        provider: SOLANA_TRACKER_PROVIDER,
        period: peakRequestPeriod,
        requested: requestedPeakCalls,
        limit: SOLANA_TRACKER_MONTHLY_REQUEST_LIMIT,
      }),
    );

    const peakEnrichment = await enrichObservedPeaks(
      peakCandidates,
      priorPeakTokens,
      solanaTrackerApiKey,
      {
        maxFetches: peakBudget.granted,
        now: startedAt,
      },
    );
    const peakByMint = new Map(peakEnrichment.tokens.map((token) => [token.mint, token]));
    enrichedTokens = enrichedTokens.map((token) => peakByMint.get(token.mint) ?? token);
    console.log(
      `Observed peaks: ${peakEnrichment.fetchedCount} fetched, ${peakEnrichment.reusedCount} reused, `
      + `${peakEnrichment.failedMints.length} failed; monthly budget `
      + `${peakBudget.used}/${peakBudget.limit}`,
    );
    if (!solanaTrackerApiKey) {
      console.log("SOLANA_TRACKER_API_KEY not configured; carried stored peaks without new chart requests");
    }

    const permanentPeakMints = new Set(permanentPeaks.map((peak) => peak.mint));
    const fetchedMints = new Set(peakEnrichment.fetchedMints);
    const cacheSeeds = peakEnrichment.tokens
      .filter((token) => !permanentPeakMints.has(token.mint) || fetchedMints.has(token.mint))
      .map(toPeakRecord)
      .filter((peak): peak is PeakRecord => peak !== null);
    if (cacheSeeds.length > 0) {
      await runWithRetry(
        "Store permanent observed peak cache",
        () => convex.mutation(api.observedPeaks.upsertMany, {
          peaks: cacheSeeds,
          patchTokenRows: false,
        }),
      );
    }

    const newlyFetchedPeaks = peakEnrichment.tokens
      .filter((token) => fetchedMints.has(token.mint))
      .map(toPeakRecord)
      .filter((peak): peak is PeakRecord => peak !== null);
    if (newlyFetchedPeaks.length > 0) {
      await runWithRetry(
        "Patch observed peaks onto retained token rows",
        () => convex.mutation(api.observedPeaks.upsertMany, {
          peaks: newlyFetchedPeaks,
          patchTokenRows: true,
        }),
      );
    }

    console.log("Storing in Convex...");
    const storeResult = await runWithRetry(
      "Store Convex snapshot",
      () => convex.mutation(api.graduatedTokens.storeSnapshot, {
        date: today,
        executionEndedAt: duneResult.executionEndedAt,
        tokens: enrichedTokens,
        sourceMetadata,
        replaceExisting: true,
        preserveExistingTokens: true,
      }),
    );
    const preservedTokenCount = "preserved" in storeResult ? storeResult.preserved : 0;

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
          snapshotTokenCount: storeResult.stored,
          enrichedCount: enrichedTokens.length,
          enrichmentFailedCount: failedEnrichments.length,
          enrichmentSuccessRate: enrichmentRate,
          observedPeakAttemptedCount: peakEnrichment.attemptedCount,
          solanaTrackerMonthlyPeriod: peakBudget.period,
          solanaTrackerMonthlyUsed: peakBudget.used,
          solanaTrackerMonthlyLimit: peakBudget.limit,
          solanaTrackerMonthlyRemaining: peakBudget.remaining,
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
      executionEndedAt: duneResult.executionEndedAt,
      retryCount,
      sourceMetadata,
      enrichment: {
        failedCount: failedEnrichments.length,
        successRate: enrichmentRate,
      },
      observedPeaks: {
        attemptedCount: peakEnrichment.attemptedCount,
        fetchedCount: peakEnrichment.fetchedCount,
        reusedCount: peakEnrichment.reusedCount,
        failedCount: peakEnrichment.failedMints.length,
        skippedWithoutSupplyCount: peakEnrichment.skippedWithoutSupply.length,
        pendingEligibleCount: Math.max(0, eligiblePeakCount - peakEnrichment.fetchedCount),
        monthlyBudget: {
          period: peakBudget.period,
          used: peakBudget.used,
          limit: peakBudget.limit,
          remaining: peakBudget.remaining,
        },
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
