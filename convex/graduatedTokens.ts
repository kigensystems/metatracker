import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  assertSourceExecutionNotOlder,
  evaluateSnapshotReplacement,
  getSnapshotMergeStats,
  validateSnapshotInput,
} from "./snapshot_guards";
import { tokenValidator } from "./token_validator";

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
    preserveExistingTokens: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Safety check: only allow overwriting today's data unless an admin backfill explicitly opts in.
    const today = new Date().toISOString().split("T")[0];
    validateSnapshotInput(args, today);

    const existing = await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.date))
      .collect();

    const existingSnapshot = await ctx.db
      .query("dailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    assertSourceExecutionNotOlder(args.executionEndedAt, existingSnapshot?.executionEndedAt);

    const preserveExistingTokens = args.preserveExistingTokens === true;
    const replacement = preserveExistingTokens
      ? { skip: false as const }
      : evaluateSnapshotReplacement({
          incomingTokenCount: args.tokens.length,
          existingTokenCount: existing.length,
          existingSnapshotTokenCount: existingSnapshot?.tokenCount,
          replaceExisting: args.replaceExisting,
          allowPartialOverwrite: args.allowPartialOverwrite,
          minExistingTokenRetentionRatio: args.minExistingTokenRetentionRatio,
        });

    if (replacement.skip) {
      return {
        stored: existing.length,
        skipped: true,
        reason: replacement.reason,
      };
    }

    let storedTokenCount = args.tokens.length;
    let preservedTokenCount = 0;

    if (preserveExistingTokens) {
      const merge = getSnapshotMergeStats(existing, args.tokens);
      const existingByMint = new Map(existing.map((token) => [token.mint, token]));

      // Replace rows that are present in the incoming source result, but retain
      // every earlier token that disappeared from a later rolling window.
      for (const token of args.tokens) {
        const stored = existingByMint.get(token.mint);
        if (stored) await ctx.db.delete(stored._id);
        await ctx.db.insert("graduatedTokens", {
          snapshotDate: args.date,
          ...token,
        });
      }

      storedTokenCount = merge.finalCount;
      preservedTokenCount = merge.preservedCount;
    } else {
      // Exact replacement remains available for explicit historical backfills.
      for (const token of existing) {
        await ctx.db.delete(token._id);
      }

      for (const token of args.tokens) {
        await ctx.db.insert("graduatedTokens", {
          snapshotDate: args.date,
          ...token,
        });
      }
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
        tokenCount: storedTokenCount,
        captureMode: preserveExistingTokens ? "daily-observed-union" : "rolling-snapshot",
        ...sourcePatch,
      });
    } else {
      await ctx.db.insert("dailySnapshots", {
        date: args.date,
        executionEndedAt: args.executionEndedAt,
        capturedAt: Date.now(),
        tokenCount: storedTokenCount,
        captureMode: preserveExistingTokens ? "daily-observed-union" : "rolling-snapshot",
        ...sourcePatch,
      });
    }

    return {
      stored: storedTokenCount,
      incoming: args.tokens.length,
      preserved: preservedTokenCount,
      skipped: false,
    };
  },
});
