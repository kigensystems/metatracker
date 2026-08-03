import type { Config, Context } from "@netlify/functions";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import {
  PUMP_PEAK_SOURCE,
  REPORTED_PEAK_INTERVAL,
  fetchReportedPeak,
  getErrorMessage,
  type PeakObservation,
} from "./_shared/token-sync";
import { sleep } from "./_shared/retry";

/**
 * Fills in the reported peak market cap for tokens whose run is over.
 *
 * This is deliberately separate from the two-hour cohort sync: a peak is a
 * completed fact about a token rather than part of capturing the day's list, so
 * a provider outage here can never stop a snapshot from being stored.
 *
 * The two-hour sync records an ATH for almost every mint it sees, but only ever
 * as `ok` — it never writes a row for a mint the feed gave no ATH for. So this
 * job owns two things the sync structurally cannot: settling those mints as
 * `empty` so they stop being treated as unread, and re-reading a token once it
 * has aged out of the 24h discovery window, which catches a final peak move.
 */

/** The feed's window is 24h wide, so by then the token has left the live cohort. */
const MIN_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * This meta moves fast and attention moves on; a token older than this is not
 * worth a request. pump.fun answers for far older mints, so this bound is now a
 * relevance choice rather than a quota one — widening it costs nothing but time.
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
/** pump.fun publishes no rate-limit headers; one read per second is well clear. */
const REQUEST_SPACING_MS = 1_000;
const MAX_ATTEMPTS = 3;
/**
 * One mint failing is normal — a coin can be delisted or unknown. Every mint
 * failing is an outage, and continuing would burn the retry budget of the whole
 * batch on it, so stop and let the next run try again.
 */
const MAX_CONSECUTIVE_FAILURES = 5;

interface RunSummary {
  requested: number;
  ok: number;
  empty: number;
  failed: number;
  /** Set when reads failed back to back and the run stopped early. */
  halted?: boolean;
}

export default async function handler(_request: Request, _context: Context) {
  const convexUrl = process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error("CONVEX_URL is not configured");
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500 });
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

    console.log(`Reading reported peaks for ${pending.length} tokens`);
    let buffer: PeakObservation[] = [];
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
        source: PUMP_PEAK_SOURCE,
        fetchedAt: Date.now(),
        observations: buffer,
      });
      buffer = [];
    };

    let lastRequestAt = 0;
    let consecutiveFailures = 0;
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
        const peak = await fetchReportedPeak(candidate.mint, candidate.createdAt, startedAt);
        consecutiveFailures = 0;

        if (peak) {
          buffer.push(peak);
          summary.ok += 1;
        } else {
          buffer.push({
            mint: candidate.mint,
            status: "empty",
            windowFrom: candidate.createdAt,
            windowTo: startedAt,
            candleInterval: REPORTED_PEAK_INTERVAL,
          });
          summary.empty += 1;
        }
      } catch (error) {
        summary.failed += 1;
        buffer.push({
          mint: candidate.mint,
          status: "failed",
          windowFrom: candidate.createdAt,
          windowTo: startedAt,
          candleInterval: REPORTED_PEAK_INTERVAL,
          lastError: getErrorMessage(error).slice(0, 500),
        });

        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          summary.halted = true;
          console.warn(
            `${consecutiveFailures} reads failed in a row after `
            + `${summary.ok + summary.empty + summary.failed} attempts; stopping this run`,
          );
          break;
        }
      }

      if (buffer.length >= RECORD_BATCH_SIZE) await flush();
    }

    await flush();

    console.log(
      `Reported peaks: ${summary.ok} found, ${summary.empty} with no ATH, `
      + `${summary.failed} failed`
      + (summary.halted ? " (stopped early after consecutive failures)" : ""),
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
// `background: true`, not `type: "background"` — see the note in scheduled-sync.
export const config: Config = {
  schedule: "20 * * * *",
  background: true,
};
