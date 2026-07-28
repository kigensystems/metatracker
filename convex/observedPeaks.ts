import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const observationValidator = v.object({
  mint: v.string(),
  // A literal union, not a bare string: `record` is reachable by any caller, so
  // the boundary should reject a status the readers do not understand.
  status: v.union(v.literal("ok"), v.literal("empty"), v.literal("failed")),
  peakMarketCapUsd: v.optional(v.number()),
  peakAt: v.optional(v.number()),
  windowFrom: v.number(),
  windowTo: v.number(),
  candleInterval: v.string(),
  candleCount: v.optional(v.number()),
  lastError: v.optional(v.string()),
});

export const byMints = query({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args) => {
    // Runs on every dashboard load; the lookups are independent, so issue them
    // together rather than serializing one round trip per token.
    const peaks = await Promise.all(
      [...new Set(args.mints)].map((mint) => ctx.db
        .query("observedPeaks")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .first()),
    );

    return peaks.filter((peak) => peak !== null);
  },
});

/**
 * Mints that still need a peak reading, oldest first.
 *
 * Bounded on both ends by design. `createdBefore` waits until the token's run
 * is over; `createdAfter` drops tokens old enough that nobody is researching
 * them any more. Reads are limited to snapshots on or after `sinceDate` via the
 * `by_date` index rather than scanning every token ever stored, which would
 * approach Convex's per-query read ceiling at current data size.
 */
export const pending = query({
  args: {
    limit: v.number(),
    sinceDate: v.string(),
    createdBefore: v.number(),
    createdAfter: v.number(),
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxAttempts = args.maxAttempts ?? 3;

    // A mint's own creation time; snapshot date is the fallback for the rows
    // DexScreener never gave a pair creation time for.
    const createdAtByMint = new Map<string, number>();
    const recentTokens = await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.gte("snapshotDate", args.sinceDate))
      .collect();

    for (const token of recentTokens) {
      const createdAt = token.createdAt ?? Date.parse(`${token.snapshotDate}T00:00:00Z`);
      if (!Number.isFinite(createdAt)) continue;
      if (createdAt > args.createdBefore || createdAt < args.createdAfter) continue;

      const known = createdAtByMint.get(token.mint);
      if (known === undefined || createdAt < known) createdAtByMint.set(token.mint, createdAt);
    }

    const entries = [...createdAtByMint];
    const existingRows = await Promise.all(
      entries.map(([mint]) => ctx.db
        .query("observedPeaks")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .first()),
    );

    const candidates: { mint: string; createdAt: number; attempts: number }[] = [];
    entries.forEach(([mint, createdAt], index) => {
      const existing = existingRows[index];
      const retryable = existing?.status === "failed" && existing.attempts < maxAttempts;
      if (existing && !retryable) return;

      candidates.push({ mint, createdAt, attempts: existing?.attempts ?? 0 });
    });

    candidates.sort((left, right) => left.createdAt - right.createdAt);
    return candidates.slice(0, Math.max(0, Math.min(args.limit, 500)));
  },
});

export const record = mutation({
  args: {
    source: v.string(),
    fetchedAt: v.number(),
    observations: v.array(observationValidator),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const observation of args.observations) {
      const existing = await ctx.db
        .query("observedPeaks")
        .withIndex("by_mint", (q) => q.eq("mint", observation.mint))
        .first();

      if (!existing) {
        await ctx.db.insert("observedPeaks", {
          ...observation,
          source: args.source,
          fetchedAt: args.fetchedAt,
          attempts: 1,
        });
        inserted += 1;
        continue;
      }

      // `pending` never re-offers a mint that already read `ok`, so this only
      // fires if some other caller repeats a reading. Keep the larger peak then,
      // so a later partial view cannot erase a real run.
      const keepExisting = existing.status === "ok"
        && (existing.peakMarketCapUsd ?? 0) >= (observation.peakMarketCapUsd ?? 0);
      const winner = keepExisting
        ? {
            status: existing.status,
            peakMarketCapUsd: existing.peakMarketCapUsd,
            peakAt: existing.peakAt,
            windowFrom: existing.windowFrom,
            windowTo: existing.windowTo,
            candleInterval: existing.candleInterval,
            candleCount: existing.candleCount,
            lastError: existing.lastError,
          }
        : observation;

      await ctx.db.patch(existing._id, {
        ...winner,
        mint: existing.mint,
        source: args.source,
        fetchedAt: args.fetchedAt,
        attempts: existing.attempts + 1,
      });
      updated += 1;
    }

    return { inserted, updated };
  },
});
