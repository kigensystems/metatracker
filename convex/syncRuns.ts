import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

export const start = mutation({
  args: {
    queryId: v.string(),
    slot: v.string(),
    slotDate: v.string(),
    slotHour: v.number(),
    startedAt: v.number(),
    trigger: v.optional(v.string()),
    windowStart: v.optional(v.string()),
    windowEnd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { trigger, ...run } = args;
    return await ctx.db.insert("syncRuns", {
      ...run,
      trigger: trigger || "scheduled",
      status: "running",
    });
  },
});

export const markSuccess = mutation({
  args: {
    id: v.id("syncRuns"),
    endedAt: v.number(),
    retryCount: v.optional(v.number()),
    duneStatusCode: v.optional(v.number()),
    duneExecutionId: v.optional(v.string()),
    duneExecutionEndedAt: v.string(),
    duneState: v.optional(v.string()),
    duneRowCount: v.optional(v.number()),
    duneTotalRowCount: v.optional(v.number()),
    duneResultSizeBytes: v.optional(v.number()),
    sourceQueryKind: v.optional(v.string()),
    snapshotDate: v.string(),
    tokenCount: v.number(),
    enrichedCount: v.number(),
    enrichmentFailedCount: v.number(),
    enrichmentSuccessRate: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      status: "success",
    });
    return id;
  },
});

export const markFailure = mutation({
  args: {
    id: v.id("syncRuns"),
    endedAt: v.number(),
    retryCount: v.optional(v.number()),
    duneStatusCode: v.optional(v.number()),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      status: "failed",
    });
    return id;
  },
});

export const latest = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 10, 50);
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_started_at")
      .order("desc")
      .take(limit);
  },
});

export const bySlots = query({
  args: {
    slots: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const runs: Doc<"syncRuns">[] = [];

    for (const slot of args.slots) {
      const slotRuns = await ctx.db
        .query("syncRuns")
        .withIndex("by_slot", (q) => q.eq("slot", slot))
        .collect();

      runs.push(...slotRuns);
    }

    return runs;
  },
});

export const oldest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("syncRuns")
      .withIndex("by_started_at")
      .order("asc")
      .first();
  },
});
