import { sleep, withRetries } from "./retry.js";

export interface DuneGraduatedToken {
  mint: string;
  symbol: string;
  marketCap: number;
  tradeCount: number;
  vwapPrice: number;
  graduatedAt?: number;
  measuredVolumeUsd?: number;
  buyCount?: number;
  sellCount?: number;
  sourceExecutionEndedAt?: string;
}

export interface TokenLinks {
  dexscreener: string;
  birdeye: string;
  solscan: string;
}

export interface StoredToken {
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  bannerImage?: string;
  marketCap?: number;
  duneMarketCap?: number;
  duneVwapPrice?: number;
  dexMarketCap?: number;
  dexPriceUsd?: number;
  dexFetchedAt?: number;
  dexPairAddress?: string;
  liquidity?: number;
  volume24h?: number;
  priceUsd?: number;
  priceChange24h?: number;
  tradeCount?: number;
  createdAt?: number;
  graduatedAt?: number;
  measuredVolumeUsd?: number;
  buyCount?: number;
  sellCount?: number;
  sourceExecutionEndedAt?: string;
  linksJson: string;
  dexScreenerUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface DuneSourceMetadata {
  queryId: string;
  executionId?: string;
  executionEndedAt: string;
  state?: string;
  responseStatusCode: number;
  rowCount: number;
  totalRowCount: number;
  resultSizeBytes: number;
  fetchedAt: number;
  sourceQueryKind: "latest" | "backfill";
  windowStart?: string;
  windowEnd?: string;
}

export interface DuneFetchResult {
  tokens: DuneGraduatedToken[];
  executionEndedAt: string;
  sourceMetadata: DuneSourceMetadata;
}

export interface DuneLatestStatus {
  executionEndedAt: string;
  state: string;
  responseStatusCode: number;
  executionId?: string;
}

/**
 * A peak reading ready for `observedPeaks.record`. pump.fun reports an
 * all-time high directly, so unlike the Solana Tracker path there is no candle
 * window to qualify — the window is the token's whole life.
 *
 * Recorded unfiltered. pump.fun's feed does contain wash-printed ATHs, but no
 * reliable way to identify them at capture time has been found — see the
 * fake-ATH section of docs/HISTORY.md's 2026-07-28/29 entry before adding one.
 */
export interface PeakObservation {
  mint: string;
  /** `empty` means the venue has no ATH for the mint; `failed`, that the read threw. */
  status: "ok" | "empty" | "failed";
  peakMarketCapUsd?: number;
  peakAt?: number;
  windowFrom: number;
  windowTo: number;
  candleInterval: string;
  lastError?: string;
}

export interface EnrichmentResult {
  tokens: StoredToken[];
  failedEnrichments: string[];
  enrichmentRate: number;
  /** Empty unless pump.fun supplied an ATH for at least one token. */
  peakObservations: PeakObservation[];
}

interface DuneResponseMetadata {
  row_count?: number;
  total_row_count?: number;
  result_set_bytes?: number;
  total_result_set_bytes?: number;
}

interface DuneResponse {
  execution_id?: string;
  query_id?: number;
  state?: string;
  execution_ended_at?: string;
  next_offset?: number;
  next_uri?: string;
  result?: {
    rows?: Record<string, unknown>[];
    metadata?: DuneResponseMetadata;
  };
}

interface DuneExecutionStatus {
  execution_id: string;
  query_id?: number;
  is_execution_finished?: boolean;
  state: string;
  execution_ended_at?: string;
  error?: {
    message?: string;
    type?: string;
  };
}

interface DexScreenerPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume: { h24: number };
  liquidity: { usd: number };
  marketCap: number;
  priceChange: { h24: number };
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: Array<{ url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

const DUNE_API_BASE = "https://api.dune.com/api/v1";
export const DEFAULT_DUNE_QUERY_ID = "4124453";

export class DuneApiError extends Error {
  statusCode?: number;
  responseText?: string;

  constructor(message: string, statusCode?: number, responseText?: string) {
    super(message);
    this.name = "DuneApiError";
    this.statusCode = statusCode;
    this.responseText = responseText;
  }
}

export function buildTokenLinks(mint: string): TokenLinks {
  return {
    dexscreener: `https://dexscreener.com/solana/${mint}`,
    birdeye: `https://birdeye.so/token/${mint}?chain=solana`,
    solscan: `https://solscan.io/token/${mint}`,
  };
}

const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPlausibleSolanaAddress(value: unknown): value is string {
  return typeof value === "string" && SOLANA_ADDRESS_PATTERN.test(value);
}

export function selectDexScreenerPair(
  pairs: DexScreenerPair[] | null | undefined,
  mint: string,
): DexScreenerPair | null {
  const matchingPairs = (pairs || []).filter((pair) => (
    pair.chainId === "solana"
    && pair.baseToken?.address === mint
    && isPlausibleSolanaAddress(pair.pairAddress)
  ));

  return matchingPairs.sort(
    (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
  )[0] || null;
}

export class DuneExecutionPendingError extends Error {
  executionId: string;
  state: string;

  constructor(executionId: string, state: string) {
    super(`Dune execution ${executionId} is still ${state}`);
    this.name = "DuneExecutionPendingError";
    this.executionId = executionId;
    this.state = state;
  }
}

class DexScreenerError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "DexScreenerError";
    this.statusCode = statusCode;
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getDuneStatusCode(error: unknown): number | undefined {
  if (error instanceof DuneApiError && error.statusCode) {
    return error.statusCode;
  }

  if (error instanceof Error && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode);
    return Number.isFinite(statusCode) ? statusCode : undefined;
  }

  return undefined;
}

export function isDuneExecutionPendingError(error: unknown): error is DuneExecutionPendingError {
  return error instanceof DuneExecutionPendingError;
}

function isRetryableHttpStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

export function isRetryableSyncError(error: unknown): boolean {
  const statusCode = getDuneStatusCode(error);
  return statusCode === undefined || isRetryableHttpStatus(statusCode);
}

function isRetryableDexError(error: unknown): boolean {
  if (error instanceof DexScreenerError && error.statusCode) {
    return isRetryableHttpStatus(error.statusCode);
  }

  return true;
}

function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1_000 : value;
  }

  if (typeof value !== "string" || value.length === 0) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function asOptionalTimestampString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function parseDuneRows(rows: Record<string, unknown>[]): DuneGraduatedToken[] {
  return rows
    .map((row) => {
      const graduatedAt = asOptionalTimestamp(row.graduation_time);
      const measuredVolumeUsd = asOptionalFiniteNumber(row.volume_usd);
      const buyCount = asOptionalFiniteNumber(row.buy_count);
      const sellCount = asOptionalFiniteNumber(row.sell_count);
      const sourceExecutionEndedAt = asOptionalTimestampString(row.source_execution_ended_at);

      return {
        mint: String(row.token_address || ""),
        symbol: String(row.asset || "???"),
        marketCap: Number(row.market_cap) || 0,
        tradeCount: Number(row.trade_count) || 0,
        vwapPrice: Number(row.vwap_token_price) || 0,
        ...(graduatedAt !== undefined ? { graduatedAt } : {}),
        ...(measuredVolumeUsd !== undefined ? { measuredVolumeUsd } : {}),
        ...(buyCount !== undefined ? { buyCount } : {}),
        ...(sellCount !== undefined ? { sellCount } : {}),
        ...(sourceExecutionEndedAt !== undefined ? { sourceExecutionEndedAt } : {}),
      };
    })
    .filter((token) => token.mint && token.mint.length > 30);
}

export function validateDuneResultCompleteness(result: DuneFetchResult) {
  const { tokens, sourceMetadata } = result;

  if (!Number.isFinite(Date.parse(result.executionEndedAt))) {
    throw new Error(`Dune returned an invalid execution timestamp (${result.executionEndedAt})`);
  }

  if (sourceMetadata.state && sourceMetadata.state !== "QUERY_STATE_COMPLETED") {
    throw new Error(`Dune query did not complete cleanly: ${sourceMetadata.state}`);
  }

  if (tokens.length === 0) {
    throw new Error("Dune returned 0 usable tokens; preserving existing snapshot");
  }

  if (sourceMetadata.rowCount < sourceMetadata.totalRowCount) {
    throw new Error(
      `Dune returned a partial page (${sourceMetadata.rowCount}/${sourceMetadata.totalRowCount} rows); preserving existing snapshot`,
    );
  }

  if (tokens.length < sourceMetadata.rowCount) {
    throw new Error(
      `Dune returned ${sourceMetadata.rowCount} rows but only ${tokens.length} usable token rows; preserving existing snapshot`,
    );
  }
}

async function parseDuneResponse(
  response: Response,
  queryId: string,
  sourceQueryKind: DuneSourceMetadata["sourceQueryKind"],
  window?: { windowStart?: string; windowEnd?: string },
): Promise<DuneFetchResult> {
  const responseText = await response.text();

  if (!response.ok) {
    throw new DuneApiError(`Dune API error: ${response.status}`, response.status, responseText);
  }

  const data = JSON.parse(responseText) as DuneResponse;
  const rows = data.result?.rows || [];
  const metadata = data.result?.metadata || {};
  const rowCount = asFiniteNumber(metadata.row_count, rows.length);
  const totalRowCount = asFiniteNumber(metadata.total_row_count, rowCount);
  const resultSizeBytes = asFiniteNumber(
    metadata.result_set_bytes ?? metadata.total_result_set_bytes,
    textByteLength(responseText),
  );
  const executionEndedAt = data.execution_ended_at || "";
  const state = data.state || "QUERY_STATE_COMPLETED";

  const tokens = parseDuneRows(rows).map((token) => ({
    ...token,
    sourceExecutionEndedAt: token.sourceExecutionEndedAt || executionEndedAt,
  }));

  const result: DuneFetchResult = {
    tokens,
    executionEndedAt,
    sourceMetadata: {
      queryId: String(data.query_id ?? queryId),
      executionId: data.execution_id,
      executionEndedAt,
      state,
      responseStatusCode: response.status,
      rowCount,
      totalRowCount,
      resultSizeBytes,
      fetchedAt: Date.now(),
      sourceQueryKind,
      ...window,
    },
  };

  validateDuneResultCompleteness(result);

  if (data.next_offset !== undefined || data.next_uri) {
    throw new Error("Dune response indicates additional pages; preserving existing snapshot");
  }

  return result;
}

export async function fetchLatestDuneData(
  apiKey: string,
  queryId = DEFAULT_DUNE_QUERY_ID,
): Promise<DuneFetchResult> {
  const response = await fetch(`${DUNE_API_BASE}/query/${queryId}/results?limit=1000`, {
    headers: { "X-Dune-API-Key": apiKey },
  });

  return parseDuneResponse(response, queryId, "latest");
}

export async function fetchLatestDuneStatus(
  apiKey: string,
  queryId = DEFAULT_DUNE_QUERY_ID,
): Promise<DuneLatestStatus> {
  const response = await fetch(`${DUNE_API_BASE}/query/${queryId}/results?limit=0`, {
    headers: { "X-Dune-API-Key": apiKey },
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new DuneApiError(`Dune API error: ${response.status}`, response.status, responseText);
  }

  const data = JSON.parse(responseText) as DuneResponse;
  const executionEndedAt = data.execution_ended_at || "";
  if (!Number.isFinite(Date.parse(executionEndedAt))) {
    throw new Error(`Dune returned an invalid execution timestamp (${executionEndedAt})`);
  }

  return {
    executionEndedAt,
    state: data.state || "QUERY_STATE_COMPLETED",
    responseStatusCode: response.status,
    executionId: data.execution_id,
  };
}

export async function startDuneBackfillExecution(
  apiKey: string,
  queryId: string,
  windowStart: string,
  windowEnd: string,
): Promise<{ executionId: string; state: string }> {
  const response = await fetch(`${DUNE_API_BASE}/query/${queryId}/execute`, {
    method: "POST",
    headers: {
      "X-Dune-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query_parameters: {
        window_start: windowStart,
        window_end: windowEnd,
      },
      performance: "medium",
    }),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new DuneApiError(`Dune execute error: ${response.status}`, response.status, responseText);
  }

  const data = JSON.parse(responseText) as { execution_id?: string; state?: string };
  if (!data.execution_id) {
    throw new Error("Dune execute response did not include execution_id");
  }

  return {
    executionId: data.execution_id,
    state: data.state || "QUERY_STATE_PENDING",
  };
}

export async function fetchDuneExecutionStatus(
  apiKey: string,
  executionId: string,
): Promise<DuneExecutionStatus> {
  const response = await fetch(`${DUNE_API_BASE}/execution/${executionId}/status`, {
    headers: { "X-Dune-API-Key": apiKey },
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new DuneApiError(`Dune status error: ${response.status}`, response.status, responseText);
  }

  return JSON.parse(responseText) as DuneExecutionStatus;
}

export function isTerminalFailureState(state: string): boolean {
  return state === "QUERY_STATE_FAILED"
    || state === "QUERY_STATE_CANCELED"
    || state === "QUERY_STATE_CANCELLED"
    || state === "QUERY_STATE_EXPIRED"
    || state === "QUERY_STATE_COMPLETED_PARTIAL";
}

async function waitForDuneExecution(
  apiKey: string,
  executionId: string,
  maxPolls: number,
  pollIntervalMs: number,
): Promise<DuneExecutionStatus> {
  let lastStatus: DuneExecutionStatus | null = null;

  for (let poll = 0; poll < maxPolls; poll += 1) {
    lastStatus = await fetchDuneExecutionStatus(apiKey, executionId);

    if (lastStatus.state === "QUERY_STATE_COMPLETED") {
      return lastStatus;
    }

    if (isTerminalFailureState(lastStatus.state)) {
      throw new Error(
        `Dune execution ${executionId} ended as ${lastStatus.state}: ${lastStatus.error?.message || "no error detail"}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new DuneExecutionPendingError(executionId, lastStatus?.state || "QUERY_STATE_PENDING");
}

export async function fetchDuneExecutionData(
  apiKey: string,
  executionId: string,
  queryId: string,
  windowStart: string,
  windowEnd: string,
): Promise<DuneFetchResult> {
  const response = await fetch(`${DUNE_API_BASE}/execution/${executionId}/results?limit=1000`, {
    headers: { "X-Dune-API-Key": apiKey },
  });

  return parseDuneResponse(response, queryId, "backfill", { windowStart, windowEnd });
}

export async function fetchBackfillDuneData(
  apiKey: string,
  queryId: string,
  windowStart: string,
  windowEnd: string,
  options: { maxPolls?: number; pollIntervalMs?: number } = {},
): Promise<DuneFetchResult> {
  const { executionId } = await startDuneBackfillExecution(apiKey, queryId, windowStart, windowEnd);
  await waitForDuneExecution(
    apiKey,
    executionId,
    options.maxPolls ?? 4,
    options.pollIntervalMs ?? 2_000,
  );
  return fetchDuneExecutionData(apiKey, executionId, queryId, windowStart, windowEnd);
}

interface DexScreenerFetchResult {
  pair: DexScreenerPair;
  fetchedAt: number;
}

async function fetchDexScreenerOnce(mint: string): Promise<DexScreenerFetchResult | null> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);

  if (!response.ok) {
    if (response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500) {
      throw new DexScreenerError(`DexScreener error: ${response.status}`, response.status);
    }

    return null;
  }

  const data = await response.json() as DexScreenerResponse;
  const pair = selectDexScreenerPair(data.pairs, mint);
  return pair ? { pair, fetchedAt: Date.now() } : null;
}

/**
 * pump.fun metadata for a coin, taken from the graduated feed.
 *
 * DexScreener only carries art and links for teams that have *claimed* their
 * token profile, which almost no fresh launch has: measured on a live cohort it
 * gave art for 13 of 37 and a website for 6 of 37. pump.fun is the launch venue
 * for these tokens and holds the creator's own submission, which covered 37/37
 * and 28/37 of the same cohort.
 */
export interface PumpFunMeta {
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  /** Live USD market cap. Within ~1% of DexScreener, and still present for
   *  dead tokens whose pair DexScreener has dropped. */
  marketCap?: number;
  /** All-time-high market cap in USD, and when it happened. Matched a Solana
   *  Tracker reading to 0.3% on TRUMPFOLIO ($8.94M vs $8.91M). */
  athMarketCap?: number;
  athAt?: number;
}

/**
 * Community docs put the coins endpoints at roughly 20 req/min. A burst of 65
 * in a minute drew no 429 in testing, so the ceiling looks soft — this paces at
 * one page per second regardless. A 24h cohort is ~20 pages, so there is
 * nothing to win by going faster.
 */
const PUMP_REQUEST_SPACING_MS = 1_000;

/**
 * Identifies the discovery source in `syncRuns` and `dailySnapshots`. It sits in
 * the columns Dune's query id used to occupy, so an audit row says which
 * pipeline produced it.
 */
export const PUMP_SOURCE_ID = "pumpfun:coins?complete=true";
/** Distinguishes an ATH reported by the venue from a candle-derived peak. */
export const PUMP_PEAK_SOURCE = "pump.fun";
/** `candleInterval` for a venue-reported ATH; the UI labels these differently. */
export const REPORTED_PEAK_INTERVAL = "reported";
/** v1 and v2 are already retired, so the next move should be a one-line change. */
const PUMP_API_BASE = "https://frontend-api-v3.pump.fun";
const PUMP_REQUEST_TIMEOUT_MS = 15_000;
/** How far back each sync reads the graduated feed. */
export const PUMP_DISCOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One page of the graduated feed. The list carries full coin objects. */
const PUMP_PAGE_SIZE = 50;
/** Stop paging rather than walk the entire history if the cutoff never hits. */
const PUMP_MAX_PAGES = 40;

export function pumpMetaFromCoin(coin: Record<string, unknown>): PumpFunMeta {
  const text = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed !== 'https://' && trimmed !== 'http://' ? trimmed : undefined;
  };
  const positive = (value: unknown): number | undefined => {
    const parsed = asOptionalFiniteNumber(value);
    return parsed !== undefined && parsed > 0 ? parsed : undefined;
  };

  return {
    image: text(coin.image_uri),
    website: text(coin.website),
    twitter: text(coin.twitter),
    telegram: text(coin.telegram),
    marketCap: positive(coin.usd_market_cap),
    athMarketCap: positive(coin.ath_market_cap),
    athAt: positive(coin.ath_market_cap_timestamp),
  };
}

export interface PumpGraduatedResult {
  tokens: DuneGraduatedToken[];
  /** Metadata straight off the list, so enrichment needs no second request. */
  meta: Map<string, PumpFunMeta>;
  createdAt: Map<string, number>;
  pagesFetched: number;
  /**
   * Whether the walk actually reached the far edge of the window.
   *
   * False when a page request failed or the page cap ran out, which truncates
   * the cohort by an unknown amount. The paging itself still degrades rather
   * than throwing — the caller decides, and `scheduled-sync` refuses to store a
   * partial day rather than record it as a success.
   */
  complete: boolean;
}

/**
 * Graduated tokens straight from the launch venue.
 *
 * The Dune query this replaces detects graduation by matching one hardcoded
 * bonding-curve instruction, and now misses most of them — measured against
 * this feed it returned 52 for a 24h window that pump.fun reports ~995 for.
 *
 * The list carries live market cap and an all-time high alongside the art and
 * links, so `enrichTokens` needs DexScreener only for volume, liquidity and 24h
 * change. The ATH is passed through unfiltered; see `PeakObservation`.
 */
export async function fetchGraduatedFromPumpFun(
  windowMs: number = 24 * 60 * 60 * 1000,
  now: number = Date.now(),
): Promise<PumpGraduatedResult> {
  const cutoff = now - windowMs;
  const tokens: DuneGraduatedToken[] = [];
  const meta = new Map<string, PumpFunMeta>();
  const createdAt = new Map<string, number>();
  const seen = new Set<string>();
  let pagesFetched = 0;
  let complete = false;

  for (let page = 0; page < PUMP_MAX_PAGES; page += 1) {
    const url = `${PUMP_API_BASE}/coins`
      + `?offset=${page * PUMP_PAGE_SIZE}&limit=${PUMP_PAGE_SIZE}`
      + `&sort=created_timestamp&order=DESC&complete=true&includeNsfw=true`;

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PUMP_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) break;

    const body = await response.json() as unknown;
    const coins = Array.isArray(body)
      ? body as Record<string, unknown>[]
      : ((body as { coins?: Record<string, unknown>[] })?.coins ?? []);
    // An empty page is the feed genuinely ending, not a truncation.
    if (coins.length === 0) {
      complete = true;
      break;
    }

    pagesFetched += 1;
    let reachedCutoff = false;

    for (const coin of coins) {
      const mint = typeof coin.mint === 'string' ? coin.mint : null;
      const created = typeof coin.created_timestamp === 'number' ? coin.created_timestamp : null;
      if (!mint || created === null) continue;

      if (created < cutoff) {
        reachedCutoff = true;
        continue;
      }
      if (seen.has(mint)) continue;
      seen.add(mint);

      tokens.push({
        mint,
        symbol: typeof coin.symbol === 'string' ? coin.symbol : '???',
        // Zero, not a guess: DexScreener supplies the live figure downstream.
        marketCap: 0,
        tradeCount: 0,
        vwapPrice: 0,
      });
      meta.set(mint, pumpMetaFromCoin(coin));
      createdAt.set(mint, created);
    }

    if (reachedCutoff) {
      complete = true;
      break;
    }
    await sleep(PUMP_REQUEST_SPACING_MS);
  }

  return { tokens, meta, createdAt, pagesFetched, complete };
}

/**
 * The reported ATH for one mint, for tokens the 24h feed no longer carries.
 *
 * Same field the graduated feed supplies, read one coin at a time. Returns null
 * when there is no ATH to be had — either pump.fun does not know the mint, or it
 * knows it and reports none — which the caller records as `empty` so the mint
 * stops being retried. Anything else throws, because a mint the venue should
 * know failing to resolve is a provider problem rather than a fact about it.
 */
export async function fetchReportedPeak(
  mint: string,
  createdAt: number,
  now: number = Date.now(),
): Promise<PeakObservation | null> {
  const response = await fetch(`${PUMP_API_BASE}/coins/${mint}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(PUMP_REQUEST_TIMEOUT_MS),
  });
  // A gone coin is a permanent answer, not an outage: recording it as `empty`
  // both stops the retries and keeps it out of the caller's outage detector.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`pump.fun coin request failed (${response.status})`);

  const meta = pumpMetaFromCoin(await response.json() as Record<string, unknown>);
  if (!meta.athMarketCap) return null;

  return {
    mint,
    status: 'ok',
    peakMarketCapUsd: meta.athMarketCap,
    peakAt: meta.athAt,
    windowFrom: createdAt,
    windowTo: now,
    candleInterval: REPORTED_PEAK_INTERVAL,
  };
}

async function fetchDexScreener(mint: string): Promise<DexScreenerFetchResult | null> {
  try {
    const result = await withRetries(
      () => fetchDexScreenerOnce(mint),
      {
        attempts: 2,
        initialDelayMs: 250,
        maxDelayMs: 1_000,
        shouldRetry: isRetryableDexError,
      },
    );

    return result.value;
  } catch {
    return null;
  }
}

export interface EnrichOptions {
  /**
   * Metadata already in hand. The graduated feed returns full coin objects, so
   * that path passes them here rather than re-requesting one mint at a time.
   */
  pumpMeta?: Map<string, PumpFunMeta>;
  /** pump.fun's creation time, which beats DexScreener's pair-created time. */
  createdAt?: Map<string, number>;
}

/**
 * DexScreener throttles above ~5 req/sec, and a throttled read is HTTP 200 with
 * empty `volume`/`liquidity` rather than an error — it never retries, never
 * counts as a failure, and reads downstream as "this token has no market".
 * Five in flight, then a full second, holds the run under that ceiling. A
 * ~1,000-token cohort takes ~200s, well inside the 15-minute background limit.
 */
const DEX_BATCH_SIZE = 5;
const DEX_BATCH_SPACING_MS = 1_000;

export async function enrichTokens(
  tokens: DuneGraduatedToken[],
  options: EnrichOptions = {},
): Promise<EnrichmentResult> {
  const batchSize = DEX_BATCH_SIZE;
  const results: StoredToken[] = [];
  const failedEnrichments: string[] = [];
  const peakObservations: PeakObservation[] = [];

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    // pump.fun metadata arrives with the graduated feed, so only DexScreener
    // is fetched here.
    const [dexResults, pumpResults] = await Promise.all([
      Promise.all(batch.map((token) => fetchDexScreener(token.mint))),
      Promise.resolve(batch.map((token) => options.pumpMeta?.get(token.mint) ?? null)),
    ]);

    const enriched = batch.map((token, index) => {
      const dexResult = dexResults[index];
      const dex = dexResult?.pair;
      const pump = pumpResults[index];

      if (!dexResult) {
        failedEnrichments.push(token.mint);
      }

      const socials: Record<string, string> = {};
      dex?.info?.socials?.forEach((social) => {
        socials[social.type] = social.url;
      });
      const dexPriceUsd = dex ? asOptionalFiniteNumber(dex.priceUsd) : undefined;
      const dexMarketCap = dex ? asOptionalFiniteNumber(dex.marketCap) : undefined;
      const links = buildTokenLinks(token.mint);
      if (dex?.pairAddress) {
        links.dexscreener = `https://dexscreener.com/solana/${dex.pairAddress}`;
      }

      return {
        mint: token.mint,
        symbol: token.symbol || dex?.baseToken?.symbol || "???",
        name: dex?.baseToken?.name || token.symbol || "Unknown",
        // DexScreener's CDN art is better when it exists; pump.fun covers the
        // rest, which on a measured cohort was 24 of 37 tokens.
        image: dex?.info?.imageUrl || pump?.image || undefined,
        bannerImage: dex?.info?.header || dex?.info?.openGraph || undefined,
        // Keep the legacy fields stable while exposing explicit source semantics.
        marketCap: pump?.marketCap || token.marketCap || dexMarketCap || undefined,
        duneMarketCap: token.marketCap || undefined,
        duneVwapPrice: token.vwapPrice || undefined,
        dexMarketCap,
        dexPriceUsd,
        dexFetchedAt: dexResult?.fetchedAt,
        dexPairAddress: dex?.pairAddress,
        liquidity: dex?.liquidity?.usd || undefined,
        volume24h: dex?.volume?.h24 || undefined,
        priceUsd: token.vwapPrice || dexPriceUsd || undefined,
        priceChange24h: dex?.priceChange?.h24 || undefined,
        tradeCount: token.tradeCount || undefined,
        createdAt: options.createdAt?.get(token.mint) || dex?.pairCreatedAt || undefined,
        graduatedAt: token.graduatedAt,
        measuredVolumeUsd: token.measuredVolumeUsd,
        buyCount: token.buyCount,
        sellCount: token.sellCount,
        sourceExecutionEndedAt: token.sourceExecutionEndedAt,
        linksJson: JSON.stringify(links),
        dexScreenerUrl: links.dexscreener,
        website: dex?.info?.websites?.[0]?.url || pump?.website || undefined,
        twitter: socials.twitter || pump?.twitter || undefined,
        telegram: socials.telegram || pump?.telegram || undefined,
      };
    });

    results.push(...enriched);

    batch.forEach((token, index) => {
      const pump = pumpResults[index];
      if (!pump?.athMarketCap) return;
      const created = options.createdAt?.get(token.mint);
      peakObservations.push({
        mint: token.mint,
        status: "ok",
        peakMarketCapUsd: pump.athMarketCap,
        peakAt: pump.athAt,
        // Genuinely all-time: pump.fun tracks this from the token's creation,
        // so the window is not the bounded one the candle reader had to use.
        windowFrom: created ?? pump.athAt ?? Date.now(),
        windowTo: Date.now(),
        candleInterval: REPORTED_PEAK_INTERVAL,
      });
    });

    if (i + batchSize < tokens.length) {
      await sleep(DEX_BATCH_SPACING_MS);
    }
  }

  const enrichmentRate = tokens.length > 0
    ? ((tokens.length - failedEnrichments.length) / tokens.length) * 100
    : 100;

  return {
    tokens: results,
    failedEnrichments,
    enrichmentRate,
    peakObservations,
  };
}
