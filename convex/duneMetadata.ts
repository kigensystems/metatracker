import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { queryId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("duneMetadata")
      .withIndex("by_query", (q) => q.eq("queryId", args.queryId))
      .first();
  },
});

export const update = mutation({
  args: {
    queryId: v.string(),
    lastExecutionEndedAt: v.string(),
    lastFetchedAt: v.number(),
    totalRowCount: v.number(),
    lastExecutionId: v.optional(v.string()),
    lastDuneState: v.optional(v.string()),
    lastResponseStatusCode: v.optional(v.number()),
    lastRowCount: v.optional(v.number()),
    lastResultSizeBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("duneMetadata")
      .withIndex("by_query", (q) => q.eq("queryId", args.queryId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastExecutionEndedAt: args.lastExecutionEndedAt,
        lastFetchedAt: args.lastFetchedAt,
        totalRowCount: args.totalRowCount,
        lastExecutionId: args.lastExecutionId,
        lastDuneState: args.lastDuneState,
        lastResponseStatusCode: args.lastResponseStatusCode,
        lastRowCount: args.lastRowCount,
        lastResultSizeBytes: args.lastResultSizeBytes,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("duneMetadata", args);
    }
  },
});
