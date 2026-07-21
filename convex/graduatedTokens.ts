import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  assertSourceExecutionNotOlder,
  evaluateSnapshotReplacement,
  validateSnapshotInput,
} from "./snapshot-guards";
import { tokenValidator } from "./token-validator";

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

    const replacement = evaluateSnapshotReplacement({
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
