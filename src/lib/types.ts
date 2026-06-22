export interface GraduatedToken {
  // Core data from Dune
  mint: string;

  // Enriched metadata
  name: string;
  symbol: string;
  image: string | null;
  bannerImage: string | null;

  // DexScreener market data
  priceUsd: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  priceChange24h: number | null;
  tradeCount: number | null;
  createdAt: number | null;
  dexScreenerUrl: string | null;

  // Socials
  website: string | null;
  twitter: string | null;
  telegram: string | null;

  // Links
  links: {
    dexscreener: string | null;
    birdeye: string;
    solscan: string;
  };
}

export type SortKey = 'volume24h' | 'marketCap' | 'priceChange24h';

export interface DataFreshness {
  source: string | null;
  snapshotDate: string | null;
  fetchedAt: string | null;
  capturedAt: number | null;
  duneExecutionEndedAt: string | null;
  latestDuneExecutionEndedAt: string | null;
  isStale: boolean;
  staleReason: string | null;
  dateMode: string | null;
  totalCount: number | null;
  enrichment: {
    failedCount: number;
    successRate: number;
  } | null;
}
