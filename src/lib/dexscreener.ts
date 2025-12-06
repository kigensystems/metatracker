import type { DexScreenerToken } from './types';

const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerToken[] | null;
}

export async function getTokenData(mint: string): Promise<DexScreenerToken | null> {
  try {
    const response = await fetch(`${DEXSCREENER_API_BASE}/tokens/${mint}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const data: DexScreenerResponse = await response.json();

    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }

    // Return the pair with highest liquidity (usually the main trading pair)
    const sortedPairs = data.pairs
      .filter(p => p.chainId === 'solana')
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

    return sortedPairs[0] || null;
  } catch (error) {
    console.error(`Failed to fetch DexScreener data for ${mint}:`, error);
    return null;
  }
}

export function getDexScreenerUrl(mint: string): string {
  return `https://dexscreener.com/solana/${mint}`;
}

export function getBirdeyeUrl(mint: string): string {
  return `https://birdeye.so/token/${mint}?chain=solana`;
}

export function getSolscanUrl(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

export function getRugcheckUrl(mint: string): string {
  return `https://rugcheck.xyz/tokens/${mint}`;
}
