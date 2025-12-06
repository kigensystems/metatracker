import { query } from "./_generated/server";
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
