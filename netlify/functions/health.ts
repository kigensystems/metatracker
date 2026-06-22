import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import {
  SYNC_STALE_AFTER_MS,
  getLatestSuccessfulRun,
  getSyncAgeMs,
  isHealthOk,
} from './_shared/sync-health';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(request: Request, _context: Context) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    return new Response(
      JSON.stringify({ ok: false, error: 'CONVEX_URL not configured' }),
      { status: 500, headers },
    );
  }

  try {
    const now = new Date();
    const convex = new ConvexHttpClient(convexUrl);

    const [recentRuns, oldestRun, snapshots] = await Promise.all([
      convex.query(api.syncRuns.latest, { limit: 50 }),
      convex.query(api.syncRuns.oldest),
      convex.query(api.dailySnapshots.list),
    ]);

    const latestSuccess = getLatestSuccessfulRun(recentRuns);
    const ageMs = getSyncAgeMs(latestSuccess, now.getTime());
    const ok = isHealthOk(latestSuccess, now.getTime());

    return new Response(
      JSON.stringify({
        ok,
        checkedAt: now.toISOString(),
        monitoringStartedAt: oldestRun ? new Date(oldestRun.startedAt).toISOString() : null,
        latestSnapshot: snapshots[0] || null,
        latestRun: recentRuns[0] || null,
        latestSuccess,
        syncAgeMinutes: ageMs === null ? null : Math.round(ageMs / 60000),
        staleAfterMinutes: Math.round(SYNC_STALE_AFTER_MS / 60000),
      }),
      { status: ok ? 200 : 503, headers },
    );
  } catch (error) {
    console.error('Health check failed:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Health check failed',
        details: String(error),
      }),
      { status: 500, headers },
    );
  }
}
