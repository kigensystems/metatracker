import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tracks Dune query execution state for cache invalidation
  duneMetadata: defineTable({
    queryId: v.string(),
    lastExecutionEndedAt: v.string(),
    lastFetchedAt: v.number(),
    totalRowCount: v.number(),
  }).index("by_query", ["queryId"]),

  // Daily snapshots - index of available dates
  dailySnapshots: defineTable({
    date: v.string(), // "2025-12-05" (UTC date)
    executionEndedAt: v.string(),
    capturedAt: v.number(),
    tokenCount: v.number(),
  }).index("by_date", ["date"]),

  // Individual token records linked to snapshots
  graduatedTokens: defineTable({
    snapshotDate: v.string(),
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
    createdAt: v.optional(v.number()), // Pair creation timestamp from DexScreener
    linksJson: v.string(), // JSON stringified links object
    dexScreenerUrl: v.optional(v.string()),
    website: v.optional(v.string()),
    twitter: v.optional(v.string()),
    telegram: v.optional(v.string()),
    // ========================================
    // DEPRECATED FIELDS
    // Kept for backward compatibility with existing data.
    // Do not use in new code. Will be removed after data migration.
    // ========================================
    /** @deprecated No longer populated - was from rugcheck integration */
    freezeAuthorityRevoked: v.optional(v.boolean()),
    /** @deprecated No longer populated - was from rugcheck integration */
    mintAuthorityRevoked: v.optional(v.boolean()),
    /** @deprecated No longer populated */
    lpBurned: v.optional(v.boolean()),
    /** @deprecated No longer populated - was from rugcheck integration */
    lpLockedPercent: v.optional(v.number()),
    /** @deprecated No longer populated */
    top10HolderPercent: v.optional(v.number()),
    /** @deprecated No longer populated */
    legitimacyScore: v.optional(v.number()),
    /** @deprecated No longer populated - was from rugcheck integration */
    rugcheckScore: v.optional(v.number()),
    /** @deprecated No longer populated */
    riskLevel: v.optional(v.string()),
    /** @deprecated No longer populated */
    risksJson: v.optional(v.string()),
  })
    .index("by_date", ["snapshotDate"])
    .index("by_mint", ["mint"]),
});
