/**
 * Observed peak market cap from Solana Tracker's OHLCV chart endpoint.
 *
 * Two provider behaviours drive the design here, both verified against the live
 * API on 2026-07-27:
 *
 * 1. A response is capped at 2000 candles and returns the *most recent* ones.
 *    `time_from` cannot pull coverage further back. At `1m` a token with more
 *    than 2000 traded minutes silently loses its early history — which is
 *    exactly where memecoin peaks occur. `1h` keeps a token's whole life inside
 *    the cap (2000 hourly candles is ~83 days) and an hourly candle's `high` is
 *    the max of its minute highs, so brief wicks survive.
 * 2. The documented raw parameters are snake_case. Sending `timeFrom`/`timeTo`
 *    is silently ignored and returns the provider's default window.
 *
 * Peaks are read once per mint, after the token's run is over, so the value is
 * a completed observation rather than a running maximum.
 */

const SOLANA_TRACKER_API_BASE = "https://data.solanatracker.io";
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Hourly keeps a full token lifetime inside the provider's 2000-candle cap. */
export const PEAK_CANDLE_INTERVAL = "1h";
export const PEAK_SOURCE = "solana-tracker";

export interface SolanaTrackerCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface ObservedPeak {
  peakMarketCapUsd: number;
  peakAt: number;
}

export interface ObservedPeakObservation {
  mint: string;
  /** `failed` is only ever produced by the caller when a read throws. */
  status: "ok" | "empty" | "failed";
  windowFrom: number;
  windowTo: number;
  candleInterval: string;
  candleCount: number;
  peakMarketCapUsd?: number;
  peakAt?: number;
  lastError?: string;
}

/**
 * The provider is refusing all traffic, not just this token: rate limit, bad
 * key, or an exhausted plan. The caller must stop the run rather than record
 * per-token failures, otherwise one exhausted quota would burn the retry
 * budget of every pending mint at once.
 */
export class SolanaTrackerHaltError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Solana Tracker is refusing requests (${status})`);
    this.name = "SolanaTrackerHaltError";
    this.status = status;
  }
}

const HALT_STATUSES = new Set([401, 402, 403, 429]);

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

/** Highest candle in the window, wicks included. */
export function peakFromCandles(candles: SolanaTrackerCandle[]): ObservedPeak | null {
  const peak = candles.reduce<SolanaTrackerCandle | null>((best, candle) => {
    if (candle.high <= 0) return best;
    return best === null || candle.high > best.high ? candle : best;
  }, null);

  if (!peak) return null;

  return { peakMarketCapUsd: peak.high, peakAt: peak.time * 1000 };
}

interface FetchChartOptions {
  apiKey: string;
  mint: string;
  timeFrom: number;
  timeTo: number;
  interval?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchTokenChart({
  apiKey,
  mint,
  timeFrom,
  timeTo,
  interval = PEAK_CANDLE_INTERVAL,
  fetchImpl = fetch,
}: FetchChartOptions): Promise<SolanaTrackerCandle[]> {
  if (!apiKey.trim()) throw new Error("SOLANA_TRACKER_API_KEY is not configured");
  if (!SOLANA_ADDRESS_PATTERN.test(mint)) throw new Error("Invalid Solana token mint");
  if (!Number.isFinite(timeFrom) || !Number.isFinite(timeTo) || timeFrom <= 0 || timeTo <= timeFrom) {
    throw new Error("Invalid Solana Tracker chart window");
  }

  const url = new URL(`/chart/${mint}`, SOLANA_TRACKER_API_BASE);
  url.searchParams.set("type", interval);
  // Snake_case is the raw HTTP contract; camelCase is silently ignored.
  url.searchParams.set("time_from", String(Math.floor(timeFrom)));
  url.searchParams.set("time_to", String(Math.floor(timeTo)));
  // Candles are market cap, so no supply has to be inferred from mixed-time
  // Dune and DexScreener values.
  url.searchParams.set("marketCap", "true");
  // A brief wick is a real result for this dashboard; never discard it.
  url.searchParams.set("removeOutliers", "false");

  const response = await fetchImpl(url, { headers: { "x-api-key": apiKey } });

  if (HALT_STATUSES.has(response.status)) throw new SolanaTrackerHaltError(response.status);
  if (!response.ok) {
    throw new Error(`Solana Tracker chart request failed (${response.status})`);
  }

  return parseSolanaTrackerChart(await response.json());
}

interface FetchObservedPeakOptions {
  apiKey: string;
  mint: string;
  createdAt: number;
  now?: number;
  fetchImpl?: typeof fetch;
}

/**
 * One completed observation of a token's whole life. Returns `empty` when the
 * provider has no candles for the mint so the caller can stop asking.
 */
export async function fetchObservedPeak({
  apiKey,
  mint,
  createdAt,
  now = Date.now(),
  fetchImpl,
}: FetchObservedPeakOptions): Promise<ObservedPeakObservation> {
  const windowFrom = Math.floor(createdAt / 1000);
  const windowTo = Math.floor(now / 1000);

  const candles = await fetchTokenChart({
    apiKey,
    mint,
    timeFrom: windowFrom,
    timeTo: windowTo,
    fetchImpl,
  });
  const peak = peakFromCandles(candles);

  return {
    mint,
    status: peak ? "ok" : "empty",
    windowFrom: windowFrom * 1000,
    windowTo: windowTo * 1000,
    candleInterval: PEAK_CANDLE_INTERVAL,
    candleCount: candles.length,
    ...(peak ? { peakMarketCapUsd: peak.peakMarketCapUsd, peakAt: peak.peakAt } : {}),
  };
}
