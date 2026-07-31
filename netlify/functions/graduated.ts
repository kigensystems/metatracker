import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { SYNC_STALE_AFTER_MS } from './_shared/sync-health';
import { toApiToken, withObservedPeaks, type TokenLike } from './_shared/api-contract';

/**
 * Reads stored snapshots. Nothing here calls a data source.
 *
 * Capture belongs to `scheduled-sync`, which is a background function precisely
 * because a full cohort needs minutes of paced enrichment — time a request
 * handler does not have. Recency is owned by `syncRuns` and `/api/health`, so
 * this endpoint has no freshness comparison to make and no reason to hold an
 * API key.
 */

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

/**
 * Attaches observed peaks by mint. A peak lookup failure degrades to tokens
 * without peaks rather than failing the whole response.
 */
async function attachObservedPeaks(
  convex: ConvexHttpClient,
  tokens: TokenLike[],
): Promise<TokenLike[]> {
  const mints = tokens
    .map((token) => token.mint)
    .filter((mint): mint is string => typeof mint === 'string' && mint.length > 0);
  if (mints.length === 0) return tokens;

  try {
    return withObservedPeaks(tokens, await convex.query(api.observedPeaks.byMints, { mints }));
  } catch (error) {
    console.warn('Observed peak lookup failed; serving tokens without peaks:', error);
    return tokens;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export default async function handler(request: Request, _context: Context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'live';
    const date = url.searchParams.get('date');

    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      return json({ error: 'CONVEX_URL not configured' }, 500);
    }

    const convex = new ConvexHttpClient(convexUrl);

    if (mode === 'historical') {
      if (!date) {
        return json({ error: 'date parameter required for historical mode' }, 400);
      }

      const [storedTokens, snapshot] = await Promise.all([
        convex.query(api.graduatedTokens.byDate, { date }),
        convex.query(api.dailySnapshots.byDate, { date }),
      ]);
      const tokens = await attachObservedPeaks(convex, storedTokens);

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

    // Live: the most recent snapshot stored, which is not necessarily today's.
    // Between UTC midnight and the first sync of the day there is no row for
    // today, and yesterday's cohort is a better answer than an empty table.
    const snapshot = await convex.query(api.dailySnapshots.latest);

    if (!snapshot) {
      return json({
        tokens: [],
        totalCount: 0,
        snapshotDate: null,
        capturedAt: null,
        source: 'snapshot',
        isStale: true,
        staleReason: 'No snapshot has been stored yet.',
      });
    }

    const storedTokens = await convex.query(api.graduatedTokens.byDate, { date: snapshot.date });
    const tokens = await attachObservedPeaks(convex, storedTokens);

    // The same tolerance /api/health applies: one missed run is not an outage.
    const capturedAgeMs = Date.now() - snapshot.capturedAt;
    const isStale = capturedAgeMs > SYNC_STALE_AFTER_MS;

    return json({
      tokens: tokens.map(toApiToken),
      totalCount: tokens.length,
      snapshotDate: snapshot.date,
      capturedAt: snapshot.capturedAt,
      fetchedAt: new Date(snapshot.capturedAt).toISOString(),
      duneExecutionEndedAt: snapshot.executionEndedAt || null,
      source: 'snapshot',
      dateMode: snapshot.captureMode || 'rolling-snapshot',
      isStale,
      ...(isStale
        ? { staleReason: `No sync has completed in ${Math.round(capturedAgeMs / 3_600_000)}h.` }
        : {}),
    });
  } catch (error) {
    console.error('Error fetching graduated tokens:', error);
    return json({ error: 'Failed to fetch tokens', details: String(error) }, 500);
  }
}
