import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Token data shape for storage
const tokenValidator = v.object({
  mint: v.string(),
  symbol: v.string(),
  name: v.string(),
  image: v.optional(v.string()),
  marketCap: v.optional(v.number()),
  liquidity: v.optional(v.number()),
  volume24h: v.optional(v.number()),
  priceUsd: v.optional(v.number()),
  priceChange24h: v.optional(v.number()),
  tradeCount: v.optional(v.number()),
  createdAt: v.optional(v.number()),
  linksJson: v.string(),
  dexScreenerUrl: v.optional(v.string()),
  website: v.optional(v.string()),
  twitter: v.optional(v.string()),
  telegram: v.optional(v.string()),
  // Legacy fields
  freezeAuthorityRevoked: v.optional(v.boolean()),
  mintAuthorityRevoked: v.optional(v.boolean()),
  lpBurned: v.optional(v.boolean()),
  lpLockedPercent: v.optional(v.number()),
  top10HolderPercent: v.optional(v.number()),
  legitimacyScore: v.optional(v.number()),
  rugcheckScore: v.optional(v.number()),
  riskLevel: v.optional(v.string()),
  risksJson: v.optional(v.string()),
});

export const byDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.date))
      .collect();
  },
});

export const byMint = query({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("graduatedTokens")
      .withIndex("by_mint", (q) => q.eq("mint", args.mint))
      .collect();
  },
});

export const storeSnapshot = mutation({
  args: {
    date: v.string(),
    executionEndedAt: v.string(),
    tokens: v.array(tokenValidator),
  },
  handler: async (ctx, args) => {
    // Safety check: only allow overwriting today's data
    const today = new Date().toISOString().split("T")[0];
    if (args.date !== today) {
      throw new Error(`Cannot overwrite historical data for ${args.date}. Only today (${today}) can be updated.`);
    }

    // Delete existing tokens for today (upsert behavior for same-day refreshes)
    const existing = await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.date))
      .collect();

    for (const token of existing) {
      await ctx.db.delete(token._id);
    }

    // Insert new tokens
    for (const token of args.tokens) {
      await ctx.db.insert("graduatedTokens", {
        snapshotDate: args.date,
        ...token,
      });
    }

    // Upsert daily snapshot record
    const existingSnapshot = await ctx.db
      .query("dailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, {
        executionEndedAt: args.executionEndedAt,
        capturedAt: Date.now(),
        tokenCount: args.tokens.length,
      });
    } else {
      await ctx.db.insert("dailySnapshots", {
        date: args.date,
        executionEndedAt: args.executionEndedAt,
        capturedAt: Date.now(),
        tokenCount: args.tokens.length,
      });
    }

    return { stored: args.tokens.length };
  },
});
