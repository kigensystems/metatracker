export interface GraduatedToken {
  // Core data from Dune
  mint: string;

  // Enriched metadata
  name: string;
  symbol: string;
  image: string | null;
  bannerImage: string | null;

  // Legacy display fields. marketCap/priceUsd currently prefer Dune values.
  priceUsd: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  duneMarketCap?: number | null;
  duneVwapPrice?: number | null;
  dexMarketCap?: number | null;
  dexPriceUsd?: number | null;
  dexFetchedAt?: number | null;
  dexPairAddress?: string | null;
  priceChange24h: number | null;
  tradeCount: number | null;
  createdAt: number | null;
  graduatedAt?: number | null;
  observedPeakMarketCap?: number | null;
  observedPeakAt?: number | null;
  observedPeakPriceUsd?: number | null;
  observedPeakFetchedAt?: number | null;
  observedPeakSource?: string | null;
  observedPeakSupply?: number | null;
  observedPeakSupplySource?: string | null;
  measuredVolumeUsd?: number | null;
  buyCount?: number | null;
  sellCount?: number | null;
  sourceExecutionEndedAt?: string | null;
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

export type SortKey = 'volume24h' | 'marketCap' | 'observedPeakMarketCap' | 'priceChange24h';

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
