import type { Config, Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

interface DuneResponse {
  execution_id: string;
  query_id: number;
  state: string;
  execution_ended_at: string;
  result: {
    rows: Record<string, unknown>[];
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

const DUNE_API_BASE = 'https://api.dune.com/api/v1';
const QUERY_ID = '4124453';

async function fetchDuneData(apiKey: string) {
  const response = await fetch(`${DUNE_API_BASE}/query/${QUERY_ID}/results`, {
    headers: { 'X-Dune-API-Key': apiKey },
  });

  if (!response.ok) throw new Error(`Dune API error: ${response.status}`);

  const data: DuneResponse = await response.json();
  const rows = data.result?.rows || [];

  const tokens = rows.map((row: Record<string, unknown>) => ({
    mint: String(row.token_address || ''),
    symbol: String(row.asset || '???'),
    marketCap: Number(row.market_cap) || 0,
    tradeCount: Number(row.trade_count) || 0,
    vwapPrice: Number(row.vwap_token_price) || 0,
  })).filter((t) => t.mint && t.mint.length > 30);

  return { tokens, executionEndedAt: data.execution_ended_at };
}

async function fetchDexScreener(mint: string): Promise<DexScreenerPair | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return null;
    const data = await response.json();
    const solanaPairs = data.pairs?.filter((p: DexScreenerPair) => p.chainId === 'solana') || [];
    return solanaPairs.sort((a: DexScreenerPair, b: DexScreenerPair) =>
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0] || null;
  } catch {
    return null;
  }
}

interface EnrichmentResult {
  tokens: Array<{
    mint: string;
    symbol: string;
    name: string;
    image?: string;
    marketCap?: number;
    liquidity?: number;
    volume24h?: number;
    priceUsd?: number;
    priceChange24h?: number;
    tradeCount?: number;
    createdAt?: number;
    linksJson: string;
    dexScreenerUrl: string;
    website?: string;
    twitter?: string;
  }>;
  failedEnrichments: string[];
  enrichmentRate: number;
}

async function enrichTokens(tokens: Array<{ mint: string; symbol: string; marketCap: number; tradeCount: number; vwapPrice: number }>): Promise<EnrichmentResult> {
  // Process in batches of 15 to avoid overwhelming DexScreener
  const batchSize = 15;
  const results = [];
  const failedEnrichments: string[] = [];

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const dexResults = await Promise.all(
      batch.map(token => fetchDexScreener(token.mint))
    );

    const enriched = batch.map((token, idx) => {
      const dex = dexResults[idx];

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
        symbol: token.symbol || dex?.baseToken?.symbol || '???',
        name: dex?.baseToken?.name || token.symbol || 'Unknown',
        image: dex?.info?.imageUrl || undefined,
        marketCap: token.marketCap || dex?.marketCap || undefined,
        liquidity: dex?.liquidity?.usd || undefined,
        volume24h: dex?.volume?.h24 || undefined,
        priceUsd: token.vwapPrice || (dex ? parseFloat(dex.priceUsd) : undefined),
        priceChange24h: dex?.priceChange?.h24 || undefined,
        tradeCount: token.tradeCount || undefined,
        createdAt: dex?.pairCreatedAt || undefined,
        linksJson: JSON.stringify({
          dexscreener: `https://dexscreener.com/solana/${token.mint}`,
          birdeye: `https://birdeye.so/token/${token.mint}?chain=solana`,
          solscan: `https://solscan.io/token/${token.mint}`,
        }),
        dexScreenerUrl: `https://dexscreener.com/solana/${token.mint}`,
        website: dex?.info?.websites?.[0]?.url || undefined,
        twitter: socials.twitter || undefined,
      };
    });

    results.push(...enriched);

    // Small delay between batches
    if (i + batchSize < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const enrichmentRate = tokens.length > 0
    ? ((tokens.length - failedEnrichments.length) / tokens.length) * 100
    : 100;

  return {
    tokens: results,
    failedEnrichments,
    enrichmentRate,
  };
}

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

export default async function handler(_request: Request, _context: Context) {
  console.log('Scheduled sync started at', new Date().toISOString());

  const duneApiKey = process.env.DUNE_API_KEY;
  const convexUrl = process.env.CONVEX_URL;

  if (!duneApiKey || !convexUrl) {
    console.error('Missing required environment variables');
    return new Response(JSON.stringify({ error: 'Missing config' }), { status: 500 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    const today = getTodayUTC();

    // Fetch fresh data from Dune
    console.log('Fetching from Dune...');
    const { tokens: duneTokens, executionEndedAt } = await fetchDuneData(duneApiKey);
    console.log(`Got ${duneTokens.length} tokens from Dune`);

    // Enrich with DexScreener only
    console.log('Enriching tokens with DexScreener...');
    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneTokens);
    console.log(`Enriched ${enrichedTokens.length} tokens (${enrichmentRate.toFixed(1)}% success rate)`);
    if (failedEnrichments.length > 0) {
      console.log(`Failed to enrich ${failedEnrichments.length} tokens from DexScreener`);
    }

    // Store in Convex
    console.log('Storing in Convex...');
    await convex.mutation(api.graduatedTokens.storeSnapshot, {
      date: today,
      executionEndedAt,
      tokens: enrichedTokens,
    });

    await convex.mutation(api.duneMetadata.update, {
      queryId: QUERY_ID,
      lastExecutionEndedAt: executionEndedAt,
      lastFetchedAt: Date.now(),
      totalRowCount: duneTokens.length,
    });

    console.log('Sync complete!');

    return new Response(JSON.stringify({
      success: true,
      date: today,
      tokenCount: enrichedTokens.length,
      executionEndedAt,
      enrichment: {
        failedCount: failedEnrichments.length,
        successRate: enrichmentRate,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    return new Response(JSON.stringify({
      error: 'Sync failed',
      details: String(error),
    }), { status: 500 });
  }
}

// Run every 12 hours (at 00:00 and 12:00 UTC)
// Background function allows up to 15 minutes execution time
export const config: Config = {
  schedule: '0 0,12 * * *',
  type: 'background',
};
