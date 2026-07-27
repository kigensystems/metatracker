import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { storedTokenValidator } from "./token_validator";

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
    captureMode: v.optional(v.string()),
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
    slot: v.string(), // ISO timestamp for the expected 2-hour UTC cron slot
    slotDate: v.string(), // "2025-12-05"
    slotHour: v.number(), // even UTC hour from 0 through 22
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
    snapshotTokenCount: v.optional(v.number()),
    enrichedCount: v.optional(v.number()),
    enrichmentFailedCount: v.optional(v.number()),
    enrichmentSuccessRate: v.optional(v.number()),
    observedPeakAttemptedCount: v.optional(v.number()),
    solanaTrackerMonthlyPeriod: v.optional(v.string()),
    solanaTrackerMonthlyUsed: v.optional(v.number()),
    solanaTrackerMonthlyLimit: v.optional(v.number()),
    solanaTrackerMonthlyRemaining: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_slot", ["slot"])
    .index("by_started_at", ["startedAt"]),

  // Individual token records linked to snapshots
  graduatedTokens: defineTable(storedTokenValidator)
    .index("by_date", ["snapshotDate"])
    .index("by_mint", ["mint"]),

  // Permanent per-mint cache avoids paying for the same peak on later dates.
  observedPeaks: defineTable({
    mint: v.string(),
    observedPeakMarketCap: v.number(),
    observedPeakAt: v.number(),
    observedPeakPriceUsd: v.number(),
    observedPeakFetchedAt: v.number(),
    observedPeakSource: v.string(),
    observedPeakSupply: v.number(),
    observedPeakSupplySource: v.string(),
  }).index("by_mint", ["mint"]),

  // Atomic reservations prevent concurrent syncs from exceeding the budget.
  providerUsage: defineTable({
    provider: v.string(),
    period: v.string(),
    requestCount: v.number(),
    requestLimit: v.number(),
    updatedAt: v.number(),
  }).index("by_provider_period", ["provider", "period"]),
});
