import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("dailySnapshots")
      .order("desc")
      .take(30); // Last 30 days
  },
});

export const byDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();
  },
});

// Delete a snapshot and its tokens (for cleanup)
export const deleteByDate = mutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // Delete snapshot record
    const snapshot = await ctx.db
      .query("dailySnapshots")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (snapshot) {
      await ctx.db.delete(snapshot._id);
    }

    // Delete associated tokens
    const tokens = await ctx.db
      .query("graduatedTokens")
      .withIndex("by_date", (q) => q.eq("snapshotDate", args.date))
      .collect();

    for (const token of tokens) {
      await ctx.db.delete(token._id);
    }

    return { deleted: tokens.length + (snapshot ? 1 : 0) };
  },
});
