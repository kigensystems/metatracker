import type { StoredToken } from "./token-sync.js";

export type SolanaTrackerCandleInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d";

export interface SolanaTrackerCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface ObservedPeak {
  marketCapUsd: number;
  priceUsd: number;
  observedAt: number;
  candleVolume: number;
}

export interface ObservedPeakEnrichmentResult {
  tokens: StoredToken[];
  attemptedCount: number;
  fetchedCount: number;
  fetchedMints: string[];
  reusedCount: number;
  failedMints: string[];
  skippedWithoutSupply: string[];
}

type PeakSupplySource = "dexscreener" | "dune";
type PeakField =
  | "observedPeakMarketCap"
  | "observedPeakAt"
  | "observedPeakPriceUsd"
  | "observedPeakFetchedAt"
  | "observedPeakSource"
  | "observedPeakSupply"
  | "observedPeakSupplySource";
type PreviousPeakToken = Pick<StoredToken, "mint"> & Partial<Pick<StoredToken, PeakField>>;

interface PeakSupply {
  amount: number;
  source: PeakSupplySource;
}

interface EnrichObservedPeakOptions {
  maxFetches?: number;
  now?: number;
  pauseMs?: number;
  fetchChart?: typeof fetchSolanaTrackerChart;
}

interface FetchChartOptions {
  apiKey: string;
  mint: string;
  timeFrom: number;
  timeTo: number;
  interval?: SolanaTrackerCandleInterval;
}

const SOLANA_TRACKER_API_BASE = "https://data.solanatracker.io";
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function finiteNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseCandle(value: unknown): SolanaTrackerCandle | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const open = finiteNumber(row.open);
  const high = finiteNumber(row.high);
  const low = finiteNumber(row.low);
  const close = finiteNumber(row.close);
  const volume = finiteNumber(row.volume);
  const time = finiteNumber(row.time);

  if (
    open === null
    || high === null
    || low === null
    || close === null
    || volume === null
    || time === null
    || open < 0
    || high < 0
    || low < 0
    || close < 0
    || volume < 0
    || time <= 0
  ) {
    return null;
  }

  return { open, high, low, close, volume, time };
}

export function parseSolanaTrackerChart(payload: unknown): SolanaTrackerCandle[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Solana Tracker returned an invalid chart payload");
  }

  const record = payload as Record<string, unknown>;
  // Solana Tracker currently returns the misspelled `oclhv`; accept the
  // conventional spelling too so a provider correction is non-breaking.
  const rows = Array.isArray(record.oclhv)
    ? record.oclhv
    : Array.isArray(record.ohlcv)
      ? record.ohlcv
      : null;

  if (!rows) {
    throw new Error("Solana Tracker chart payload has no candle array");
  }

  return rows
    .map(parseCandle)
    .filter((candle): candle is SolanaTrackerCandle => candle !== null)
    .sort((a, b) => a.time - b.time);
}

export async function fetchSolanaTrackerChart({
  apiKey,
  mint,
  timeFrom,
  timeTo,
  interval = "1m",
}: FetchChartOptions): Promise<SolanaTrackerCandle[]> {
  if (!apiKey.trim()) throw new Error("SOLANA_TRACKER_API_KEY is not configured");
  if (!SOLANA_ADDRESS_PATTERN.test(mint)) throw new Error("Invalid Solana token mint");
  if (!Number.isFinite(timeFrom) || !Number.isFinite(timeTo) || timeFrom <= 0 || timeTo <= timeFrom) {
    throw new Error("Invalid Solana Tracker chart window");
  }

  const url = new URL(`/chart/${mint}`, SOLANA_TRACKER_API_BASE);
  url.searchParams.set("type", interval);
  url.searchParams.set("timeFrom", String(Math.floor(timeFrom)));
  url.searchParams.set("timeTo", String(Math.floor(timeTo)));
  url.searchParams.set("currency", "usd");

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`Solana Tracker chart request failed (${response.status})`);
  }

  return parseSolanaTrackerChart(await response.json());
}

/** Calculates the highest observed provider candle, including brief wicks. */
export function calculateObservedPeak(
  candles: SolanaTrackerCandle[],
  verifiedSupply: number,
): ObservedPeak | null {
  if (!Number.isFinite(verifiedSupply) || verifiedSupply <= 0) {
    throw new Error("A positive verified token supply is required");
  }

  const peakCandle = candles.reduce<SolanaTrackerCandle | null>((peak, candle) => {
    if (!Number.isFinite(candle.high) || candle.high <= 0) return peak;
    return peak === null || candle.high > peak.high ? candle : peak;
  }, null);

  if (!peakCandle) return null;

  return {
    marketCapUsd: peakCandle.high * verifiedSupply,
    priceUsd: peakCandle.high,
    observedAt: peakCandle.time * 1000,
    candleVolume: peakCandle.volume,
  };
}

function positiveRatio(numerator: unknown, denominator: unknown): number | null {
  const top = finiteNumber(numerator);
  const bottom = finiteNumber(denominator);
  if (top === null || bottom === null || top <= 0 || bottom <= 0) return null;

  const ratio = top / bottom;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function derivePeakSupply(token: StoredToken): PeakSupply | null {
  const dexSupply = positiveRatio(token.dexMarketCap, token.dexPriceUsd);
  if (dexSupply !== null) return { amount: dexSupply, source: "dexscreener" };

  const duneSupply = positiveRatio(token.duneMarketCap, token.duneVwapPrice);
  if (duneSupply !== null) return { amount: duneSupply, source: "dune" };

  return null;
}

const PEAK_FIELDS = [
  "observedPeakMarketCap",
  "observedPeakAt",
  "observedPeakPriceUsd",
  "observedPeakFetchedAt",
  "observedPeakSource",
  "observedPeakSupply",
  "observedPeakSupplySource",
] as const satisfies ReadonlyArray<PeakField>;

function carryPeakFields(token: StoredToken, previous?: PreviousPeakToken): StoredToken {
  if (!previous) return { ...token };

  const next = { ...token };
  for (const field of PEAK_FIELDS) {
    const value = previous[field];
    if (value !== undefined) {
      Object.assign(next, { [field]: value });
    }
  }
  return next;
}

function newestPreviousByMint(tokens: PreviousPeakToken[]): Map<string, PreviousPeakToken> {
  const byMint = new Map<string, PreviousPeakToken>();

  for (const token of tokens) {
    const current = byMint.get(token.mint);
    const currentFetchedAt = current?.observedPeakFetchedAt ?? 0;
    const candidateFetchedAt = token.observedPeakFetchedAt ?? 0;
    if (!current || candidateFetchedAt >= currentFetchedAt) {
      byMint.set(token.mint, token);
    }
  }

  return byMint;
}

function chartWindowStart(token: StoredToken, now: number): number {
  const maximumLookback = now - (48 * 60 * 60 * 1000);
  const tokenStart = Math.min(token.createdAt ?? now, now) - (6 * 60 * 60 * 1000);
  return Math.max(1, Math.floor(Math.max(maximumLookback, tokenStart) / 1000));
}

/**
 * Fetches a token's peak once, then carries it into later rolling snapshots.
 * The scheduled caller supplies today's and yesterday's stored rows so a UTC
 * date rollover does not spend another API request on the same token.
 */
export async function enrichObservedPeaks(
  tokens: StoredToken[],
  previousTokens: PreviousPeakToken[],
  apiKey: string | undefined,
  options: EnrichObservedPeakOptions = {},
): Promise<ObservedPeakEnrichmentResult> {
  const now = options.now ?? Date.now();
  const maxFetches = Math.max(0, Math.floor(options.maxFetches ?? 8));
  const pauseMs = Math.max(0, options.pauseMs ?? 350);
  const fetchChart = options.fetchChart ?? fetchSolanaTrackerChart;
  const previousByMint = newestPreviousByMint(previousTokens);
  const nextTokens = tokens.map((token) => carryPeakFields(token, previousByMint.get(token.mint)));
  const failedMints: string[] = [];
  const fetchedMints: string[] = [];
  const skippedWithoutSupply: string[] = [];
  let attemptedCount = 0;
  let fetchedCount = 0;
  let reusedCount = nextTokens.filter((token) => token.observedPeakFetchedAt !== undefined).length;

  if (!apiKey?.trim() || maxFetches === 0) {
    return {
      tokens: nextTokens,
      attemptedCount,
      fetchedCount,
      fetchedMints,
      reusedCount,
      failedMints,
      skippedWithoutSupply,
    };
  }

  for (const token of nextTokens) {
    if (token.observedPeakFetchedAt !== undefined || attemptedCount >= maxFetches) continue;

    const supply = derivePeakSupply(token);
    if (!supply) {
      skippedWithoutSupply.push(token.mint);
      continue;
    }

    attemptedCount += 1;
    try {
      const candles = await fetchChart({
        apiKey,
        mint: token.mint,
        timeFrom: chartWindowStart(token, now),
        timeTo: Math.floor(now / 1000),
        interval: "1m",
      });
      const peak = calculateObservedPeak(candles, supply.amount);

      if (!peak) {
        failedMints.push(token.mint);
        continue;
      }

      token.observedPeakMarketCap = peak.marketCapUsd;
      token.observedPeakAt = peak.observedAt;
      token.observedPeakPriceUsd = peak.priceUsd;
      token.observedPeakFetchedAt = now;
      token.observedPeakSource = "solana-tracker";
      token.observedPeakSupply = supply.amount;
      token.observedPeakSupplySource = supply.source;
      fetchedCount += 1;
      fetchedMints.push(token.mint);
    } catch {
      failedMints.push(token.mint);
    }

    if (pauseMs > 0 && attemptedCount < maxFetches) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  reusedCount = nextTokens.filter((token) => (
    token.observedPeakFetchedAt !== undefined
    && previousByMint.has(token.mint)
  )).length;

  return {
    tokens: nextTokens,
    attemptedCount,
    fetchedCount,
    fetchedMints,
    reusedCount,
    failedMints,
    skippedWithoutSupply,
  };
}
