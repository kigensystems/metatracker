import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { grantProviderRequests } from "./observed_peak_budget";

const peakValidator = v.object({
  mint: v.string(),
  observedPeakMarketCap: v.number(),
  observedPeakAt: v.number(),
  observedPeakPriceUsd: v.number(),
  observedPeakFetchedAt: v.number(),
  observedPeakSource: v.string(),
  observedPeakSupply: v.number(),
  observedPeakSupplySource: v.string(),
});

export const byMints = query({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args) => {
    const uniqueMints = [...new Set(args.mints)];
    const peaks = [];

    for (const mint of uniqueMints) {
      const peak = await ctx.db
        .query("observedPeaks")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .first();
      if (peak) peaks.push(peak);
    }

    return peaks;
  },
});

export const upsertMany = mutation({
  args: {
    peaks: v.array(peakValidator),
    patchTokenRows: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const uniqueMints = new Set(args.peaks.map((peak) => peak.mint));
    if (uniqueMints.size !== args.peaks.length) {
      throw new Error("Refusing duplicate observed peak mints");
    }

    let patchedTokenRows = 0;
    for (const peak of args.peaks) {
      const existing = await ctx.db
        .query("observedPeaks")
        .withIndex("by_mint", (q) => q.eq("mint", peak.mint))
        .first();

      let effectivePeak = peak;
      if (!existing) {
        await ctx.db.insert("observedPeaks", peak);
      } else if (peak.observedPeakMarketCap > existing.observedPeakMarketCap) {
        await ctx.db.patch(existing._id, peak);
      } else {
        effectivePeak = {
          mint: existing.mint,
          observedPeakMarketCap: existing.observedPeakMarketCap,
          observedPeakAt: existing.observedPeakAt,
          observedPeakPriceUsd: existing.observedPeakPriceUsd,
          observedPeakFetchedAt: Math.max(
            existing.observedPeakFetchedAt,
            peak.observedPeakFetchedAt,
          ),
          observedPeakSource: existing.observedPeakSource,
          observedPeakSupply: existing.observedPeakSupply,
          observedPeakSupplySource: existing.observedPeakSupplySource,
        };
        if (effectivePeak.observedPeakFetchedAt > existing.observedPeakFetchedAt) {
          await ctx.db.patch(existing._id, {
            observedPeakFetchedAt: effectivePeak.observedPeakFetchedAt,
          });
        }
      }

      if (!args.patchTokenRows) continue;

      const tokenRows = await ctx.db
        .query("graduatedTokens")
        .withIndex("by_mint", (q) => q.eq("mint", peak.mint))
        .collect();

      for (const token of tokenRows) {
        await ctx.db.patch(token._id, {
          observedPeakMarketCap: effectivePeak.observedPeakMarketCap,
          observedPeakAt: effectivePeak.observedPeakAt,
          observedPeakPriceUsd: effectivePeak.observedPeakPriceUsd,
          observedPeakFetchedAt: effectivePeak.observedPeakFetchedAt,
          observedPeakSource: effectivePeak.observedPeakSource,
          observedPeakSupply: effectivePeak.observedPeakSupply,
          observedPeakSupplySource: effectivePeak.observedPeakSupplySource,
        });
        patchedTokenRows += 1;
      }
    }

    return { stored: args.peaks.length, patchedTokenRows };
  },
});

export const reserveRequests = mutation({
  args: {
    provider: v.string(),
    period: v.string(),
    requested: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerUsage")
      .withIndex("by_provider_period", (q) => (
        q.eq("provider", args.provider).eq("period", args.period)
      ))
      .first();
    const budget = grantProviderRequests({
      used: existing?.requestCount ?? 0,
      requested: args.requested,
      limit: args.limit,
    });
    const updatedAt = Date.now();
    const requestLimit = Math.max(0, Math.floor(args.limit));

    if (existing) {
      await ctx.db.patch(existing._id, {
        requestCount: budget.usedAfter,
        requestLimit,
        updatedAt,
      });
    } else {
      await ctx.db.insert("providerUsage", {
        provider: args.provider,
        period: args.period,
        requestCount: budget.usedAfter,
        requestLimit,
        updatedAt,
      });
    }

    return {
      provider: args.provider,
      period: args.period,
      limit: requestLimit,
      used: budget.usedAfter,
      granted: budget.granted,
      remaining: budget.remaining,
    };
  },
});
