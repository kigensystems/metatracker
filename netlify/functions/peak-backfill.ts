import type { Config, Context } from "@netlify/functions";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  PEAK_CANDLE_INTERVAL,
  PEAK_SOURCE,
  SolanaTrackerHaltError,
  fetchObservedPeak,
  type ObservedPeakObservation,
} from "./_shared/solana-tracker";
import { getErrorMessage } from "./_shared/token-sync";
import { sleep } from "./_shared/retry";

/**
 * Fills in observed peak market cap for tokens whose run is over.
 *
 * This is deliberately separate from the two-hour cohort sync: a peak is a
 * completed fact about a token rather than part of capturing the day's list, so
 * a provider outage here can never stop a snapshot from being stored.
 *
 * Work is self-limiting. Each mint is read exactly once and only while it is
 * between MIN_TOKEN_AGE_MS and MAX_TOKEN_AGE_MS old, so steady-state usage
 * equals the arrival rate (~15-45/day, i.e. ~450-1350/month) and stays inside
 * the free plan's 2500/month. No budget accounting is required.
 *
 * Tokens older than the window are intentionally never read. The stored history
 * reaches back to 2026-03 (~7.2k mints); reading all of it would cost ~3x the
 * monthly free allowance to answer questions about tokens nobody is researching.
 */

/** Dune's window is 24h wide, so by then the token has left the live cohort. */
const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * This meta moves fast and attention moves on; a token older than this is not
 * worth a request. It also keeps usage permanently inside the free plan: the
 * bounded window is ~60 mints, and steady state equals the arrival rate.
 */
const MAX_TOKEN_AGE_MS = 5 * 24 * 60 * 60 * 1000;
/**
 * Snapshots are scanned back further than the eligibility window, because a
 * token near the end of that window still appears in snapshots stored after it.
 * Derived from MAX_TOKEN_AGE_MS so widening the window cannot silently strand
 * an age band outside the scan.
 */
const SNAPSHOT_LOOKBACK_MS = MAX_TOKEN_AGE_MS + (2 * 24 * 60 * 60 * 1000);
const MAX_MINTS_PER_RUN = 150;
/** Persist in small batches so partial progress survives a timeout. */
const RECORD_BATCH_SIZE = 10;
/** The free plan allows 3 req/s but rejects bursts; 1/s stays clear of 429s. */
const REQUEST_SPACING_MS = 1_000;
const MAX_ATTEMPTS = 3;

interface RunSummary {
  requested: number;
  ok: number;
  empty: number;
  failed: number;
  /** Set when the provider refused all traffic and the run stopped early. */
  haltedStatus?: number;
}

export default async function handler(_request: Request, _context: Context) {
  const convexUrl = process.env.CONVEX_URL;
  const apiKey = process.env.SOLANA_TRACKER_API_KEY;

  if (!convexUrl) {
    console.error("CONVEX_URL is not configured");
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500 });
  }

  if (!apiKey?.trim()) {
    console.log("SOLANA_TRACKER_API_KEY not configured; skipping observed peak backfill");
    return new Response(JSON.stringify({ skipped: "no-api-key" }), { status: 200 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  const startedAt = Date.now();

  try {
    const pending = await convex.query(api.observedPeaks.pending, {
      limit: MAX_MINTS_PER_RUN,
      sinceDate: new Date(startedAt - SNAPSHOT_LOOKBACK_MS).toISOString().split("T")[0],
      createdBefore: startedAt - MIN_TOKEN_AGE_MS,
      createdAfter: startedAt - MAX_TOKEN_AGE_MS,
      maxAttempts: MAX_ATTEMPTS,
    });

    if (pending.length === 0) {
      console.log("No tokens are waiting for an observed peak");
      return new Response(JSON.stringify({ requested: 0 }), { status: 200 });
    }

    console.log(`Reading observed peaks for ${pending.length} tokens`);
    let buffer: ObservedPeakObservation[] = [];
    const summary: RunSummary = {
      requested: pending.length,
      ok: 0,
      empty: 0,
      failed: 0,
    };

    // Flush as we go. A timeout or crash mid-run would otherwise discard every
    // reading taken so far, spending provider requests for nothing.
    const flush = async () => {
      if (buffer.length === 0) return;
      await convex.mutation(api.observedPeaks.record, {
        source: PEAK_SOURCE,
        fetchedAt: Date.now(),
        observations: buffer,
      });
      buffer = [];
    };

    let lastRequestAt = 0;
    for (const candidate of pending) {
      // Pace against the provider's rate limit before each read, crediting time
      // already spent on the previous fetch and any Convex flush. Waiting a full
      // interval after that work would stretch the run for no rate-limit gain.
      const sinceLastRequest = Date.now() - lastRequestAt;
      if (lastRequestAt > 0 && sinceLastRequest < REQUEST_SPACING_MS) {
        await sleep(REQUEST_SPACING_MS - sinceLastRequest);
      }
      lastRequestAt = Date.now();

      try {
        const observation = await fetchObservedPeak({
          apiKey,
          mint: candidate.mint,
          createdAt: candidate.createdAt,
        });
        buffer.push(observation);
        if (observation.status === "ok") summary.ok += 1;
        else summary.empty += 1;
      } catch (error) {
        if (error instanceof SolanaTrackerHaltError) {
          // The provider is refusing all traffic. Stop cleanly and let a later
          // run continue: the remaining mints stay pending because no row is
          // written for them, so their retry budget is untouched.
          summary.haltedStatus = error.status;
          console.warn(
            `Provider refused requests (${error.status}) after `
            + `${summary.ok + summary.empty + summary.failed} reads; stopping this run`,
          );
          break;
        }

        summary.failed += 1;
        buffer.push({
          mint: candidate.mint,
          status: "failed",
          windowFrom: candidate.createdAt,
          windowTo: startedAt,
          candleInterval: PEAK_CANDLE_INTERVAL,
          candleCount: 0,
          lastError: getErrorMessage(error).slice(0, 500),
        });
      }

      if (buffer.length >= RECORD_BATCH_SIZE) await flush();
    }

    await flush();

    console.log(
      `Observed peaks: ${summary.ok} found, ${summary.empty} with no candles, `
      + `${summary.failed} failed`
      + (summary.haltedStatus ? ` (stopped early: provider returned ${summary.haltedStatus})` : ""),
    );

    return new Response(JSON.stringify({
      ...summary,
      recorded: summary.ok + summary.empty + summary.failed,
      durationMs: Date.now() - startedAt,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Observed peak backfill failed:", error);
    return new Response(JSON.stringify({
      error: "Peak backfill failed",
      details: getErrorMessage(error),
    }), { status: 500 });
  }
}

// Hourly, offset from the two-hour cohort sync so the two never contend.
export const config: Config & { type: "background" } = {
  schedule: "20 * * * *",
  type: "background",
};
