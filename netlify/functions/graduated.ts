import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

interface DuneGraduatedToken {
  mint: string;
  symbol: string;
  marketCap: number;
  tradeCount: number;
  vwapPrice: number;
}

interface DuneResponse {
  execution_id: string;
  query_id: number;
  state: string;
  execution_ended_at: string;
  result: {
    rows: Record<string, unknown>[];
    metadata: {
      execution_time_millis: number;
      row_count: number;
      total_row_count: number;
    };
  };
}

interface DexScreenerPair {
  chainId: string;
  baseToken: { name: string; symbol: string };
  priceUsd: string;
  volume: { h24: number };
  liquidity: { usd: number };
  marketCap: number;
  priceChange: { h24: number };
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

interface EnrichedToken {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  priceChange24h: number | null;
  tradeCount: number;
  createdAt: number | null;
  dexScreenerUrl: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  links: {
    dexscreener: string;
    birdeye: string;
    solscan: string;
  };
}

interface EnrichmentResult {
  tokens: EnrichedToken[];
  failedEnrichments: string[];
  enrichmentRate: number;
}

const DUNE_API_BASE = 'https://api.dune.com/api/v1';
const QUERY_ID = '4124453';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// Fetch just the metadata from Dune (nearly free - limit=0)
async function fetchDuneStatus(apiKey: string): Promise<{ executionEndedAt: string; state: string }> {
  const response = await fetch(`${DUNE_API_BASE}/query/${QUERY_ID}/results?limit=0`, {
    headers: { 'X-Dune-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`Dune API error: ${response.status}`);
  }

  const data: DuneResponse = await response.json();
  return {
    executionEndedAt: data.execution_ended_at,
    state: data.state,
  };
}

// Fetch full data from Dune
async function fetchDuneData(apiKey: string): Promise<{ tokens: DuneGraduatedToken[]; executionEndedAt: string }> {
  const response = await fetch(`${DUNE_API_BASE}/query/${QUERY_ID}/results`, {
    headers: { 'X-Dune-API-Key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`Dune API error: ${response.status}`);
  }

  const data: DuneResponse = await response.json();
  const rows = data.result?.rows || [];

  const tokens = rows.map((row: Record<string, unknown>) => ({
    mint: String(row.token_address || ''),
    symbol: String(row.asset || '???'),
    marketCap: Number(row.market_cap) || 0,
    tradeCount: Number(row.trade_count) || 0,
    vwapPrice: Number(row.vwap_token_price) || 0,
  })).filter((t: DuneGraduatedToken) => t.mint && t.mint.length > 30);

  return {
    tokens,
    executionEndedAt: data.execution_ended_at,
  };
}

async function fetchDexScreener(mint: string): Promise<DexScreenerPair | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return null;
    const data: DexScreenerResponse = await response.json();
    // Return the Solana pair with highest liquidity
    const solanaPairs = data.pairs?.filter(p => p.chainId === 'solana') || [];
    return solanaPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] || null;
  } catch {
    return null;
  }
}

// Enrich tokens with DexScreener data
async function enrichTokens(duneTokens: DuneGraduatedToken[]): Promise<EnrichmentResult> {
  // Fetch all DexScreener data in parallel
  const dexResults = await Promise.all(
    duneTokens.map(token => fetchDexScreener(token.mint))
  );

  const failedEnrichments: string[] = [];

  const tokens = duneTokens.map((token, i) => {
    const dex = dexResults[i];

    // Track failed enrichments
    if (!dex) {
      failedEnrichments.push(token.mint);
    }

    // Extract socials into a simple object
    const socials: Record<string, string> = {};
    dex?.info?.socials?.forEach(s => {
      socials[s.type] = s.url;
    });

    return {
      mint: token.mint,
      name: dex?.baseToken?.name || token.symbol || 'Unknown',
      symbol: token.symbol || dex?.baseToken?.symbol || '???',
      image: dex?.info?.imageUrl || null,
      priceUsd: token.vwapPrice || (dex ? parseFloat(dex.priceUsd) : null),
      volume24h: dex?.volume?.h24 || null,
      liquidity: dex?.liquidity?.usd || null,
      marketCap: token.marketCap || dex?.marketCap || null,
      priceChange24h: dex?.priceChange?.h24 || null,
      tradeCount: token.tradeCount,
      createdAt: dex?.pairCreatedAt || null,
      dexScreenerUrl: `https://dexscreener.com/solana/${token.mint}`,
      website: dex?.info?.websites?.[0]?.url || null,
      twitter: socials.twitter || null,
      telegram: socials.telegram || null,
      links: {
        dexscreener: `https://dexscreener.com/solana/${token.mint}`,
        birdeye: `https://birdeye.so/token/${token.mint}?chain=solana`,
        solscan: `https://solscan.io/token/${token.mint}`,
      },
    };
  });

  const enrichmentRate = duneTokens.length > 0
    ? ((duneTokens.length - failedEnrichments.length) / duneTokens.length) * 100
    : 100;

  return {
    tokens,
    failedEnrichments,
    enrichmentRate,
  };
}

// Serialize token for Convex storage
function serializeForConvex(token: EnrichedToken) {
  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    image: token.image || undefined,
    marketCap: token.marketCap || undefined,
    liquidity: token.liquidity || undefined,
    volume24h: token.volume24h || undefined,
    priceUsd: token.priceUsd || undefined,
    priceChange24h: token.priceChange24h || undefined,
    tradeCount: token.tradeCount || undefined,
    createdAt: token.createdAt || undefined,
    linksJson: JSON.stringify(token.links),
    dexScreenerUrl: token.dexScreenerUrl || undefined,
    website: token.website || undefined,
    twitter: token.twitter || undefined,
    telegram: token.telegram || undefined,
  };
}

// Deserialize token from Convex storage
function deserializeFromConvex(stored: Record<string, unknown>) {
  return {
    mint: stored.mint,
    name: stored.name,
    symbol: stored.symbol,
    image: stored.image || null,
    priceUsd: stored.priceUsd || null,
    volume24h: stored.volume24h || null,
    liquidity: stored.liquidity || null,
    marketCap: stored.marketCap || null,
    priceChange24h: stored.priceChange24h || null,
    tradeCount: stored.tradeCount || null,
    createdAt: stored.createdAt || null,
    dexScreenerUrl: stored.dexScreenerUrl || null,
    website: stored.website || null,
    twitter: stored.twitter || null,
    telegram: stored.telegram || null,
    links: JSON.parse(stored.linksJson as string || '{}'),
  };
}

// Get today's date in UTC
function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'live';
    const date = url.searchParams.get('date');

    const duneApiKey = process.env.DUNE_API_KEY;
    const convexUrl = process.env.CONVEX_URL;

    // If Convex is not configured, fall back to direct Dune fetch
    if (!convexUrl) {
      if (!duneApiKey) {
        return new Response(
          JSON.stringify({ error: 'DUNE_API_KEY not configured' }),
          { status: 500, headers }
        );
      }

      console.log('CONVEX_URL not configured, fetching directly from Dune');
      const { tokens, executionEndedAt } = await fetchDuneData(duneApiKey);
      const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(tokens);

      return new Response(
        JSON.stringify({
          tokens: enrichedTokens,
          totalCount: tokens.length,
          fetchedAt: new Date().toISOString(),
          duneExecutionEndedAt: executionEndedAt,
          source: 'live',
          enrichment: {
            failedCount: failedEnrichments.length,
            successRate: enrichmentRate,
          },
        }),
        { status: 200, headers }
      );
    }

    const convex = new ConvexHttpClient(convexUrl);

    // Mode: check-freshness - just return metadata
    if (mode === 'check-freshness') {
      if (!duneApiKey) {
        return new Response(
          JSON.stringify({ error: 'DUNE_API_KEY not configured' }),
          { status: 500, headers }
        );
      }

      const [metadata, duneStatus] = await Promise.all([
        convex.query(api.duneMetadata.get, { queryId: QUERY_ID }),
        fetchDuneStatus(duneApiKey),
      ]);

      return new Response(
        JSON.stringify({
          lastExecutionEndedAt: duneStatus.executionEndedAt,
          cachedExecutionEndedAt: metadata?.lastExecutionEndedAt || null,
          isStale: metadata?.lastExecutionEndedAt !== duneStatus.executionEndedAt,
          lastFetchedAt: metadata?.lastFetchedAt || null,
        }),
        { status: 200, headers }
      );
    }

    // Mode: historical - fetch from Convex by date
    if (mode === 'historical') {
      if (!date) {
        return new Response(
          JSON.stringify({ error: 'date parameter required for historical mode' }),
          { status: 400, headers }
        );
      }

      const [tokens, snapshot] = await Promise.all([
        convex.query(api.graduatedTokens.byDate, { date }),
        convex.query(api.dailySnapshots.byDate, { date }),
      ]);

      return new Response(
        JSON.stringify({
          tokens: tokens.map(deserializeFromConvex),
          totalCount: tokens.length,
          snapshotDate: date,
          capturedAt: snapshot?.capturedAt || null,
          duneExecutionEndedAt: snapshot?.executionEndedAt || null,
          source: 'historical',
        }),
        { status: 200, headers }
      );
    }

    // Mode: live (default) - smart cache check
    const today = getTodayUTC();
    const forceRequested = url.searchParams.get('force') === 'true';
    const adminRefreshToken = process.env.ADMIN_REFRESH_TOKEN;
    const forceAuthorized = forceRequested
      && Boolean(adminRefreshToken)
      && request.headers.get('x-admin-refresh-token') === adminRefreshToken;

    if (forceRequested && !forceAuthorized) {
      return new Response(
        JSON.stringify({ error: 'force refresh requires admin authorization' }),
        { status: 403, headers }
      );
    }

    const [metadata, cached, snapshot] = await Promise.all([
      convex.query(api.duneMetadata.get, { queryId: QUERY_ID }),
      convex.query(api.graduatedTokens.byDate, { date: today }),
      convex.query(api.dailySnapshots.byDate, { date: today }),
    ]);

    if (!duneApiKey) {
      if (cached.length > 0) {
        console.log('DUNE_API_KEY not configured, serving cached snapshot');
        return new Response(
          JSON.stringify({
            tokens: cached.map(deserializeFromConvex),
            totalCount: cached.length,
            fetchedAt: new Date(snapshot?.capturedAt || metadata?.lastFetchedAt || Date.now()).toISOString(),
            duneExecutionEndedAt: snapshot?.executionEndedAt || metadata?.lastExecutionEndedAt || null,
            source: 'cache-stale',
            snapshotDate: today,
            isStale: true,
            staleReason: 'DUNE_API_KEY not configured',
          }),
          { status: 200, headers }
        );
      }

      return new Response(
        JSON.stringify({ error: 'DUNE_API_KEY not configured and no cached snapshot available' }),
        { status: 500, headers }
      );
    }

    let duneStatus: { executionEndedAt: string; state: string };
    try {
      duneStatus = await fetchDuneStatus(duneApiKey);
    } catch (error) {
      if (cached.length > 0) {
        console.log('Dune freshness check failed, serving cached snapshot');
        return new Response(
          JSON.stringify({
            tokens: cached.map(deserializeFromConvex),
            totalCount: cached.length,
            fetchedAt: new Date(snapshot?.capturedAt || metadata?.lastFetchedAt || Date.now()).toISOString(),
            duneExecutionEndedAt: snapshot?.executionEndedAt || metadata?.lastExecutionEndedAt || null,
            source: 'cache-stale',
            snapshotDate: today,
            isStale: true,
            staleReason: `Dune freshness check failed: ${String(error)}`,
          }),
          { status: 200, headers }
        );
      }

      throw error;
    }

    const cachedExecutionEndedAt = snapshot?.executionEndedAt || metadata?.lastExecutionEndedAt || null;
    const cacheIsFresh = cachedExecutionEndedAt === duneStatus.executionEndedAt;

    if (!forceAuthorized && cached.length > 0) {
      console.log(cacheIsFresh ? 'Serving from cache' : 'Serving stale cache');
      return new Response(
        JSON.stringify({
          tokens: cached.map(deserializeFromConvex),
          totalCount: cached.length,
          fetchedAt: new Date(snapshot?.capturedAt || metadata?.lastFetchedAt || Date.now()).toISOString(),
          duneExecutionEndedAt: cachedExecutionEndedAt,
          latestDuneExecutionEndedAt: duneStatus.executionEndedAt,
          source: cacheIsFresh ? 'cache' : 'cache-stale',
          snapshotDate: today,
          isStale: !cacheIsFresh,
        }),
        { status: 200, headers }
      );
    }

    // Cache miss or authorized force refresh - fetch fresh data without mutating durable cache metadata.
    console.log(forceAuthorized ? 'Authorized force refresh, fetching from Dune' : 'Cache miss, fetching from Dune');
    const { tokens: duneTokens, executionEndedAt } = await fetchDuneData(duneApiKey);
    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneTokens);

    if (failedEnrichments.length > 0) {
      console.log(`DexScreener enrichment: ${failedEnrichments.length} tokens failed (${enrichmentRate.toFixed(1)}% success)`);
    }

    return new Response(
      JSON.stringify({
        tokens: enrichedTokens,
        totalCount: duneTokens.length,
        fetchedAt: new Date().toISOString(),
        duneExecutionEndedAt: executionEndedAt,
        source: 'live',
        snapshotDate: today, // Tell frontend what date this data is for
        enrichment: {
          failedCount: failedEnrichments.length,
          successRate: enrichmentRate,
        },
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error fetching graduated tokens:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch tokens', details: String(error) }),
      { status: 500, headers }
    );
  }
}
