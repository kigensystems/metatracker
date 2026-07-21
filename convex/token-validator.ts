import { v } from "convex/values";

// Shared by the schema, mutation, and contract tests so additive field coverage
// exercises the exact validators deployed to Convex.
export const tokenFields = {
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
  createdAt: v.optional(v.number()),
  graduatedAt: v.optional(v.number()),
  observedPeakMarketCap: v.optional(v.number()),
  observedPeakAt: v.optional(v.number()),
  measuredVolumeUsd: v.optional(v.number()),
  buyCount: v.optional(v.number()),
  sellCount: v.optional(v.number()),
  sourceExecutionEndedAt: v.optional(v.string()),
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
};

export const tokenValidator = v.object(tokenFields);
export const storedTokenValidator = v.object({
  snapshotDate: v.string(),
  ...tokenFields,
});
