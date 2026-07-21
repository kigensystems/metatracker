import { buildTokenLinks } from './token-sync.js';

export interface TokenLike {
  mint?: unknown;
  name?: unknown;
  symbol?: unknown;
  image?: unknown;
  bannerImage?: unknown;
  priceUsd?: unknown;
  volume24h?: unknown;
  liquidity?: unknown;
  marketCap?: unknown;
  priceChange24h?: unknown;
  tradeCount?: unknown;
  createdAt?: unknown;
  graduatedAt?: unknown;
  observedPeakMarketCap?: unknown;
  observedPeakAt?: unknown;
  measuredVolumeUsd?: unknown;
  buyCount?: unknown;
  sellCount?: unknown;
  sourceExecutionEndedAt?: unknown;
  dexScreenerUrl?: unknown;
  website?: unknown;
  twitter?: unknown;
  telegram?: unknown;
  linksJson?: unknown;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeHttpUrl(value: unknown): string | null {
  const candidate = stringOrNull(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

function parseLinks(value: unknown, mint: string) {
  const fallback = mint ? buildTokenLinks(mint) : {
    dexscreener: null,
    birdeye: '',
    solscan: '',
  };

  if (typeof value !== 'string') return fallback;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) return fallback;

    return {
      dexscreener: safeHttpUrl(parsed.dexscreener) || fallback.dexscreener,
      birdeye: safeHttpUrl(parsed.birdeye) || fallback.birdeye,
      solscan: safeHttpUrl(parsed.solscan) || fallback.solscan,
    };
  } catch {
    return fallback;
  }
}

/**
 * The current /api/graduated token contract. New fields must be added without
 * renaming or changing any of these properties.
 */
export function toApiToken(stored: TokenLike) {
  const mint = stringValue(stored.mint);
  const graduatedAt = numberOrNull(stored.graduatedAt);
  const observedPeakMarketCap = numberOrNull(stored.observedPeakMarketCap);
  const observedPeakAt = numberOrNull(stored.observedPeakAt);
  const measuredVolumeUsd = numberOrNull(stored.measuredVolumeUsd);
  const buyCount = numberOrNull(stored.buyCount);
  const sellCount = numberOrNull(stored.sellCount);
  const sourceExecutionEndedAt = stringOrNull(stored.sourceExecutionEndedAt);

  return {
    mint,
    name: stringValue(stored.name, 'Unknown'),
    symbol: stringValue(stored.symbol, '???'),
    image: stringOrNull(stored.image),
    bannerImage: stringOrNull(stored.bannerImage),
    priceUsd: numberOrNull(stored.priceUsd),
    volume24h: numberOrNull(stored.volume24h),
    liquidity: numberOrNull(stored.liquidity),
    marketCap: numberOrNull(stored.marketCap),
    priceChange24h: numberOrNull(stored.priceChange24h),
    tradeCount: numberOrNull(stored.tradeCount),
    createdAt: numberOrNull(stored.createdAt),
    dexScreenerUrl: safeHttpUrl(stored.dexScreenerUrl),
    website: safeHttpUrl(stored.website),
    twitter: safeHttpUrl(stored.twitter),
    telegram: safeHttpUrl(stored.telegram),
    links: parseLinks(stored.linksJson, mint),
    ...(graduatedAt !== null ? { graduatedAt } : {}),
    ...(observedPeakMarketCap !== null ? { observedPeakMarketCap } : {}),
    ...(observedPeakAt !== null ? { observedPeakAt } : {}),
    ...(measuredVolumeUsd !== null ? { measuredVolumeUsd } : {}),
    ...(buyCount !== null ? { buyCount } : {}),
    ...(sellCount !== null ? { sellCount } : {}),
    ...(sourceExecutionEndedAt !== null ? { sourceExecutionEndedAt } : {}),
  };
}
