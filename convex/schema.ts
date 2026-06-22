import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Tracks Dune query execution state for cache invalidation
  duneMetadata: defineTable({
    queryId: v.string(),
    lastExecutionEndedAt: v.string(),
    lastFetchedAt: v.number(),
    totalRowCount: v.number(),
    lastExecutionId: v.optional(v.string()),
    lastDuneState: v.optional(v.string()),
    lastResponseStatusCode: v.optional(v.number()),
    lastRowCount: v.optional(v.number()),
    lastResultSizeBytes: v.optional(v.number()),
  }).index("by_query", ["queryId"]),

  // Daily snapshots - index of available dates
  dailySnapshots: defineTable({
    date: v.string(), // "2025-12-05" (UTC date)
    executionEndedAt: v.string(),
    capturedAt: v.number(),
    tokenCount: v.number(),
    duneQueryId: v.optional(v.string()),
    duneExecutionId: v.optional(v.string()),
    duneState: v.optional(v.string()),
    duneResponseStatusCode: v.optional(v.number()),
    duneRowCount: v.optional(v.number()),
    duneTotalRowCount: v.optional(v.number()),
    duneResultSizeBytes: v.optional(v.number()),
    sourceQueryKind: v.optional(v.string()),
    windowStart: v.optional(v.string()),
    windowEnd: v.optional(v.string()),
  }).index("by_date", ["date"]),

  // Scheduled sync attempt audit log
  syncRuns: defineTable({
    queryId: v.string(),
    slot: v.string(), // ISO timestamp for expected 00:00 or 12:00 UTC cron slot
    slotDate: v.string(), // "2025-12-05"
    slotHour: v.number(), // 0 or 12
    trigger: v.string(), // "scheduled"
    status: v.string(), // "running", "success", or "failed"
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    retryCount: v.optional(v.number()),
    duneStatusCode: v.optional(v.number()),
    duneExecutionId: v.optional(v.string()),
    duneExecutionEndedAt: v.optional(v.string()),
    duneState: v.optional(v.string()),
    duneRowCount: v.optional(v.number()),
    duneTotalRowCount: v.optional(v.number()),
    duneResultSizeBytes: v.optional(v.number()),
    sourceQueryKind: v.optional(v.string()),
    windowStart: v.optional(v.string()),
    windowEnd: v.optional(v.string()),
    snapshotDate: v.optional(v.string()),
    tokenCount: v.optional(v.number()),
    enrichedCount: v.optional(v.number()),
    enrichmentFailedCount: v.optional(v.number()),
    enrichmentSuccessRate: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_slot", ["slot"])
    .index("by_started_at", ["startedAt"]),

  // Individual token records linked to snapshots
  graduatedTokens: defineTable({
    snapshotDate: v.string(),
    mint: v.string(),
    symbol: v.string(),
    name: v.string(),
    image: v.optional(v.string()),
    bannerImage: v.optional(v.string()),
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
