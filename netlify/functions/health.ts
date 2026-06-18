import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import {
  buildExpectedSlotStatuses,
  getMissingDueSlots,
  getRecentExpectedSlots,
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
    const expectedSlots = getRecentExpectedSlots(now, 4);
    const convex = new ConvexHttpClient(convexUrl);

    const [slotRuns, recentRuns, oldestRun, snapshots] = await Promise.all([
      convex.query(api.syncRuns.bySlots, { slots: expectedSlots.map(({ slot }) => slot) }),
      convex.query(api.syncRuns.latest, { limit: 10 }),
      convex.query(api.syncRuns.oldest),
      convex.query(api.dailySnapshots.list),
    ]);

    const expected = buildExpectedSlotStatuses(expectedSlots, slotRuns, oldestRun);
    const missingDueSlots = getMissingDueSlots(expected);
    const ok = isHealthOk(oldestRun, missingDueSlots);
    const latestSnapshot = snapshots[0] || null;

    return new Response(
      JSON.stringify({
        ok,
        checkedAt: now.toISOString(),
        monitoringStartedAt: oldestRun ? new Date(oldestRun.startedAt).toISOString() : null,
        latestSnapshot,
        latestRun: recentRuns[0] || null,
        oldestRun,
        expectedSlots: expected,
        missingDueSlots,
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
