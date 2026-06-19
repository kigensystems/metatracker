export interface DuneGraduatedToken {
  mint: string;
  graduated_at: string;
  bonding_curve_address?: string;
  creator?: string;
}

export interface DexScreenerToken {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

export interface GraduatedToken {
  // Core data from Dune
  mint: string;

  // Enriched metadata
  name: string;
  symbol: string;
  image: string | null;

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

export interface FilterOptions {
  sortOrder: 'asc' | 'desc';
}
