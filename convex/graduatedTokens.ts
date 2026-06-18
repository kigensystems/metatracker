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

const sourceMetadataValidator = v.object({
  queryId: v.string(),
  executionId: v.optional(v.string()),
  executionEndedAt: v.string(),
  state: v.optional(v.string()),
  responseStatusCode: v.number(),
  rowCount: v.number(),
  totalRowCount: v.number(),
  resultSizeBytes: v.number(),
  fetchedAt: v.number(),
  sourceQueryKind: v.string(),
  windowStart: v.optional(v.string()),
  windowEnd: v.optional(v.string()),
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

export const recentStored = query({
  args: { snapshotLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const snapshotLimit = Math.min(Math.max(args.snapshotLimit ?? 45, 1), 120);
    const snapshots = await ctx.db
      .query("dailySnapshots")
      .order("desc")
      .take(snapshotLimit);

    const tokens = [];
    for (const snapshot of snapshots) {
      const snapshotTokens = await ctx.db
        .query("graduatedTokens")
        .withIndex("by_date", (q) => q.eq("snapshotDate", snapshot.date))
        .collect();

      tokens.push(...snapshotTokens.map((token) => ({
        ...token,
        snapshotCapturedAt: snapshot.capturedAt,
      })));
    }

    return tokens;
  },
});

export const storeSnapshot = mutation({
  args: {
    date: v.string(),
    executionEndedAt: v.string(),
    tokens: v.array(tokenValidator),
    sourceMetadata: v.optional(sourceMetadataValidator),
    allowHistorical: v.optional(v.boolean()),
    replaceExisting: v.optional(v.boolean()),
    allowPartialOverwrite: v.optional(v.boolean()),
    minExistingTokenRetentionRatio: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.tokens.length === 0) {
      throw new Error(`Refusing to store empty snapshot for ${args.date}.`);
    }

    if (args.sourceMetadata) {
      if (args.sourceMetadata.state && args.sourceMetadata.state !== "QUERY_STATE_COMPLETED") {
        throw new Error(`Refusing to store incomplete Dune result (${args.sourceMetadata.state}).`);
      }

      if (args.sourceMetadata.rowCount < args.sourceMetadata.totalRowCount) {
        throw new Error(
          `Refusing to store partial Dune result (${args.sourceMetadata.rowCount}/${args.sourceMetadata.totalRowCount} rows).`,
        );
      }

      if (args.tokens.length < args.sourceMetadata.rowCount) {
        throw new Error(
          `Refusing to store malformed Dune result (${args.tokens.length}/${args.sourceMetadata.rowCount} usable token rows).`,
        );
      }
    }

    // Safety check: only allow overwriting today's data unless an admin backfill explicitly opts in.
    const today = new Date().toISOString().split("T")[0];
    if (args.date !== today && !args.allowHistorical) {
      throw new Error(`Cannot overwrite historical data for ${args.date}. Only today (${today}) can be updated.`);
    }

    const existing = await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.date))
      .collect();

    const existingSnapshot = await ctx.db
      .query("dailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    const hasGoodExistingSnapshot = existing.length > 0 && (existingSnapshot?.tokenCount ?? existing.length) > 0;
    if (hasGoodExistingSnapshot && args.replaceExisting === false) {
      return {
        stored: existing.length,
        skipped: true,
        reason: "snapshot-exists",
      };
    }

    const minRetentionRatio = args.minExistingTokenRetentionRatio ?? 0.5;
    if (
      hasGoodExistingSnapshot
      && !args.allowPartialOverwrite
      && args.tokens.length < existing.length * minRetentionRatio
    ) {
      throw new Error(
        `Refusing to replace ${existing.length} existing tokens with ${args.tokens.length}; possible partial upstream response.`,
      );
    }

    // Delete existing tokens for this date (idempotent replacement for same-day syncs and approved backfills).
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

    const sourcePatch = args.sourceMetadata
      ? {
          duneQueryId: args.sourceMetadata.queryId,
          duneExecutionId: args.sourceMetadata.executionId,
          duneState: args.sourceMetadata.state,
          duneResponseStatusCode: args.sourceMetadata.responseStatusCode,
          duneRowCount: args.sourceMetadata.rowCount,
          duneTotalRowCount: args.sourceMetadata.totalRowCount,
          duneResultSizeBytes: args.sourceMetadata.resultSizeBytes,
          sourceQueryKind: args.sourceMetadata.sourceQueryKind,
          windowStart: args.sourceMetadata.windowStart,
          windowEnd: args.sourceMetadata.windowEnd,
        }
      : {};

    if (existingSnapshot) {
      await ctx.db.patch(existingSnapshot._id, {
        executionEndedAt: args.executionEndedAt,
        capturedAt: Date.now(),
        tokenCount: args.tokens.length,
        ...sourcePatch,
      });
    } else {
      await ctx.db.insert("dailySnapshots", {
        date: args.date,
        executionEndedAt: args.executionEndedAt,
        capturedAt: Date.now(),
        tokenCount: args.tokens.length,
        ...sourcePatch,
      });
    }

    return { stored: args.tokens.length, skipped: false };
  },
});
