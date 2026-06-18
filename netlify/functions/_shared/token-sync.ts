import { withRetries } from "./retry.js";

export interface DuneGraduatedToken {
  mint: string;
  symbol: string;
  marketCap: number;
  tradeCount: number;
  vwapPrice: number;
}

export interface StoredToken {
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

export interface EnrichmentResult {
  tokens: StoredToken[];
  failedEnrichments: string[];
  enrichmentRate: number;
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

export function isRetryableSyncError(error: unknown): boolean {
  const statusCode = getDuneStatusCode(error);
  if (statusCode === undefined) {
    return true;
  }

  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function isRetryableDexError(error: unknown): boolean {
  if (error instanceof DexScreenerError && error.statusCode) {
    return error.statusCode === 408 || error.statusCode === 409 || error.statusCode === 425 || error.statusCode === 429 || error.statusCode >= 500;
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

function parseDuneRows(rows: Record<string, unknown>[]): DuneGraduatedToken[] {
  return rows
    .map((row) => ({
      mint: String(row.token_address || ""),
      symbol: String(row.asset || "???"),
      marketCap: Number(row.market_cap) || 0,
      tradeCount: Number(row.trade_count) || 0,
      vwapPrice: Number(row.vwap_token_price) || 0,
    }))
    .filter((token) => token.mint && token.mint.length > 30);
}

export function validateDuneResultCompleteness(result: DuneFetchResult) {
  const { tokens, sourceMetadata } = result;

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
  const executionEndedAt = data.execution_ended_at || new Date().toISOString();
  const state = data.state || "QUERY_STATE_COMPLETED";

  const result: DuneFetchResult = {
    tokens: parseDuneRows(rows),
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

function isTerminalFailureState(state: string): boolean {
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

async function fetchDexScreenerOnce(mint: string): Promise<DexScreenerPair | null> {
  const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);

  if (!response.ok) {
    if (response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500) {
      throw new DexScreenerError(`DexScreener error: ${response.status}`, response.status);
    }

    return null;
  }

  const data = await response.json() as DexScreenerResponse;
  const solanaPairs = data.pairs?.filter((pair) => pair.chainId === "solana") || [];
  return solanaPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] || null;
}

async function fetchDexScreener(mint: string): Promise<DexScreenerPair | null> {
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

export async function enrichTokens(tokens: DuneGraduatedToken[]): Promise<EnrichmentResult> {
  const batchSize = 15;
  const results: StoredToken[] = [];
  const failedEnrichments: string[] = [];

  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const dexResults = await Promise.all(batch.map((token) => fetchDexScreener(token.mint)));

    const enriched = batch.map((token, index) => {
      const dex = dexResults[index];

      if (!dex) {
        failedEnrichments.push(token.mint);
      }

      const socials: Record<string, string> = {};
      dex?.info?.socials?.forEach((social) => {
        socials[social.type] = social.url;
      });

      return {
        mint: token.mint,
        symbol: token.symbol || dex?.baseToken?.symbol || "???",
        name: dex?.baseToken?.name || token.symbol || "Unknown",
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

    if (i + batchSize < tokens.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
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
