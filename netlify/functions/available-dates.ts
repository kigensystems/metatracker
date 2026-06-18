import type { Context } from '@netlify/functions';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { buildTokenDateCounts } from './_shared/token-dates';

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

  try {
    const convexUrl = process.env.CONVEX_URL;

    if (!convexUrl) {
      return new Response(
        JSON.stringify({ dates: [] }),
        { status: 200, headers }
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    const tokens = await convex.query(api.graduatedTokens.recentStored, { snapshotLimit: 45 });
    const dates = buildTokenDateCounts(tokens).slice(0, 30);

    return new Response(
      JSON.stringify({
        dates,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    console.error('Error fetching available dates:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch dates', details: String(error) }),
      { status: 500, headers }
    );
  }
}
