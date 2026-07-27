import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import {
  DEFAULT_DUNE_QUERY_ID,
  enrichTokens,
  fetchLatestDuneData,
  fetchLatestDuneStatus,
} from './_shared/token-sync';
import { toApiToken, type TokenLike } from './_shared/api-contract';

const QUERY_ID = DEFAULT_DUNE_QUERY_ID;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

interface SnapshotLike {
  capturedAt?: number;
  executionEndedAt?: string;
  captureMode?: string;
}

interface MetadataLike {
  lastFetchedAt?: number;
  lastExecutionEndedAt?: string;
}

// Get today's date in UTC
function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function liveDataResponse({
  tokens,
  totalCount,
  executionEndedAt,
  snapshotDate,
  failedCount,
  successRate,
}: {
  tokens: TokenLike[];
  totalCount: number;
  executionEndedAt: string;
  snapshotDate?: string;
  failedCount: number;
  successRate: number;
}) {
  return json({
    tokens: tokens.map(toApiToken),
    totalCount,
    fetchedAt: new Date().toISOString(),
    duneExecutionEndedAt: executionEndedAt,
    source: 'live',
    snapshotDate,
    enrichment: {
      failedCount,
      successRate,
    },
  });
}

function cachedSnapshotResponse({
  tokens,
  snapshot,
  metadata,
  snapshotDate,
  source,
  isStale,
  staleReason,
  latestDuneExecutionEndedAt,
}: {
  tokens: TokenLike[];
  snapshot: SnapshotLike | null;
  metadata: MetadataLike | null;
  snapshotDate: string;
  source: 'cache' | 'cache-stale';
  isStale: boolean;
  staleReason?: string;
  latestDuneExecutionEndedAt?: string;
}) {
  const duneExecutionEndedAt = snapshot?.executionEndedAt || metadata?.lastExecutionEndedAt || null;

  return json({
    tokens: tokens.map(toApiToken),
    totalCount: tokens.length,
    fetchedAt: new Date(snapshot?.capturedAt || metadata?.lastFetchedAt || Date.now()).toISOString(),
    duneExecutionEndedAt,
    latestDuneExecutionEndedAt,
    source,
    snapshotDate,
    dateMode: snapshot?.captureMode || 'rolling-snapshot',
    isStale,
    staleReason,
  });
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
        return json({ error: 'DUNE_API_KEY not configured' }, 500);
      }

      console.log('CONVEX_URL not configured, fetching directly from Dune');
      const duneResult = await fetchLatestDuneData(duneApiKey, QUERY_ID);
      const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneResult.tokens);

      return liveDataResponse({
        tokens: enrichedTokens,
        totalCount: duneResult.tokens.length,
        executionEndedAt: duneResult.executionEndedAt,
        failedCount: failedEnrichments.length,
        successRate: enrichmentRate,
      });
    }

    const convex = new ConvexHttpClient(convexUrl);

    // Mode: check-freshness - just return metadata
    if (mode === 'check-freshness') {
      if (!duneApiKey) {
        return json({ error: 'DUNE_API_KEY not configured' }, 500);
      }

      const [metadata, duneStatus] = await Promise.all([
        convex.query(api.duneMetadata.get, { queryId: QUERY_ID }),
        fetchLatestDuneStatus(duneApiKey, QUERY_ID),
      ]);

      return json({
        lastExecutionEndedAt: duneStatus.executionEndedAt,
        cachedExecutionEndedAt: metadata?.lastExecutionEndedAt || null,
        isStale: metadata?.lastExecutionEndedAt !== duneStatus.executionEndedAt,
        lastFetchedAt: metadata?.lastFetchedAt || null,
      });
    }

    // Mode: historical - fetch from Convex by date
    if (mode === 'historical') {
      if (!date) {
        return json({ error: 'date parameter required for historical mode' }, 400);
      }

      const [tokens, snapshot] = await Promise.all([
        convex.query(api.graduatedTokens.byDate, { date }),
        convex.query(api.dailySnapshots.byDate, { date }),
      ]);

      return json({
        tokens: tokens.map(toApiToken),
        totalCount: tokens.length,
        snapshotDate: date,
        capturedAt: snapshot?.capturedAt || null,
        duneExecutionEndedAt: snapshot?.executionEndedAt || null,
        source: 'historical',
        dateMode: snapshot?.captureMode || 'rolling-snapshot',
      });
    }

    // Mode: live (default) - smart cache check
    const today = getTodayUTC();
    const forceRequested = url.searchParams.get('force') === 'true';
    const adminRefreshToken = process.env.ADMIN_REFRESH_TOKEN;
    const forceAuthorized = forceRequested
      && Boolean(adminRefreshToken)
      && request.headers.get('x-admin-refresh-token') === adminRefreshToken;

    if (forceRequested && !forceAuthorized) {
      return json({ error: 'force refresh requires admin authorization' }, 403);
    }

    const [metadata, cached, snapshot] = await Promise.all([
      convex.query(api.duneMetadata.get, { queryId: QUERY_ID }),
      convex.query(api.graduatedTokens.byDate, { date: today }),
      convex.query(api.dailySnapshots.byDate, { date: today }),
    ]);

    if (!duneApiKey) {
      if (cached.length > 0) {
        console.log('DUNE_API_KEY not configured, serving cached snapshot');
        return cachedSnapshotResponse({
          tokens: cached,
          snapshot,
          metadata,
          snapshotDate: today,
          source: 'cache-stale',
          isStale: true,
          staleReason: 'DUNE_API_KEY not configured',
        });
      }

      return json({ error: 'DUNE_API_KEY not configured and no cached snapshot available' }, 500);
    }

    let duneStatus: { executionEndedAt: string; state: string };
    try {
      duneStatus = await fetchLatestDuneStatus(duneApiKey, QUERY_ID);
    } catch (error) {
      if (cached.length > 0) {
        console.log('Dune freshness check failed, serving cached snapshot');
        return cachedSnapshotResponse({
          tokens: cached,
          snapshot,
          metadata,
          snapshotDate: today,
          source: 'cache-stale',
          isStale: true,
          staleReason: `Dune freshness check failed: ${String(error)}`,
        });
      }

      throw error;
    }

    const cachedExecutionEndedAt = snapshot?.executionEndedAt || metadata?.lastExecutionEndedAt || null;
    const cacheIsFresh = cachedExecutionEndedAt === duneStatus.executionEndedAt;

    if (!forceAuthorized && cached.length > 0) {
      console.log(cacheIsFresh ? 'Serving from cache' : 'Serving stale cache');
      return cachedSnapshotResponse({
        tokens: cached,
        snapshot,
        metadata,
        snapshotDate: today,
        source: cacheIsFresh ? 'cache' : 'cache-stale',
        isStale: !cacheIsFresh,
        latestDuneExecutionEndedAt: duneStatus.executionEndedAt,
      });
    }

    // Cache miss or authorized force refresh - fetch fresh data without mutating durable cache metadata.
    console.log(forceAuthorized ? 'Authorized force refresh, fetching from Dune' : 'Cache miss, fetching from Dune');
    const duneResult = await fetchLatestDuneData(duneApiKey, QUERY_ID);
    const { tokens: enrichedTokens, failedEnrichments, enrichmentRate } = await enrichTokens(duneResult.tokens);

    if (failedEnrichments.length > 0) {
      console.log(`DexScreener enrichment: ${failedEnrichments.length} tokens failed (${enrichmentRate.toFixed(1)}% success)`);
    }

    return liveDataResponse({
      tokens: enrichedTokens,
      totalCount: duneResult.tokens.length,
      executionEndedAt: duneResult.executionEndedAt,
      snapshotDate: today,
      failedCount: failedEnrichments.length,
      successRate: enrichmentRate,
    });
  } catch (error) {
    console.error('Error fetching graduated tokens:', error);
    return json({ error: 'Failed to fetch tokens', details: String(error) }, 500);
  }
}
