import { strict as assert } from 'node:assert';
import test from 'node:test';

const helperUrl = new URL(
  '../node_modules/.cache/health-test/netlify/functions/_shared/solana-tracker.js',
  import.meta.url,
).href;

const {
  SolanaTrackerHaltError,
  fetchObservedPeak,
  fetchTokenChart,
  parseSolanaTrackerChart,
  peakFromCandles,
} = await import(helperUrl);

const MINT = 'So11111111111111111111111111111111111111112';

function jsonResponder(payload, status = 200) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: new URL(url), headers: options?.headers });
    return new Response(JSON.stringify(payload), { status });
  };
  return { calls, fetchImpl };
}

test('chart parsing accepts the provider\'s current oclhv response shape', () => {
  const candles = parseSolanaTrackerChart({
    oclhv: [
      { open: '0.2', high: '0.3', low: '0.1', close: '0.25', volume: '100', time: 20 },
      { open: 0.1, high: 0.2, low: 0.05, close: 0.15, volume: 50, time: 10 },
      { open: 'invalid', high: 1, low: 0, close: 1, volume: 1, time: 30 },
    ],
  });

  assert.deepEqual(candles, [
    { open: 0.1, high: 0.2, low: 0.05, close: 0.15, volume: 50, time: 10 },
    { open: 0.2, high: 0.3, low: 0.1, close: 0.25, volume: 100, time: 20 },
  ]);
});

test('chart parsing rejects payloads without candles', () => {
  assert.throws(
    () => parseSolanaTrackerChart({ error: 'unexpected shape' }),
    /no candle array/,
  );
});

test('peak is the highest wick in the window', () => {
  assert.deepEqual(peakFromCandles([
    { open: 100, high: 200, low: 90, close: 150, volume: 75, time: 100 },
    { open: 150, high: 900_000, low: 150, close: 400, volume: 250, time: 200 },
    { open: 400, high: 500, low: 300, close: 350, volume: 10, time: 300 },
  ]), { peakMarketCapUsd: 900_000, peakAt: 200_000 });

  assert.equal(peakFromCandles([]), null);
});

// Regression guard for the two provider behaviours that previously produced
// silently wrong peaks: camelCase time params are ignored, and 1m candles hit
// the 2000-candle cap and lose a token's early history.
test('chart requests use the raw HTTP contract and keep the key in the header', async () => {
  const { calls, fetchImpl } = jsonResponder({ oclhv: [] });

  const candles = await fetchTokenChart({
    apiKey: 'fixture-secret',
    mint: MINT,
    timeFrom: 100.9,
    timeTo: 200.9,
    fetchImpl,
  });

  assert.deepEqual(candles, []);
  const { url, headers } = calls[0];
  assert.equal(url.origin, 'https://data.solanatracker.io');
  assert.equal(url.searchParams.get('type'), '1h');
  assert.equal(url.searchParams.get('time_from'), '100');
  assert.equal(url.searchParams.get('time_to'), '200');
  assert.equal(url.searchParams.get('marketCap'), 'true');
  assert.equal(url.searchParams.get('removeOutliers'), 'false');
  assert.equal(url.searchParams.get('timeFrom'), null);
  assert.equal(url.searchParams.get('timeTo'), null);
  assert.equal(headers['x-api-key'], 'fixture-secret');
});

test('chart requests reject an unusable window or mint before calling out', async () => {
  const { calls, fetchImpl } = jsonResponder({ oclhv: [] });

  await assert.rejects(
    fetchTokenChart({ apiKey: 'k', mint: 'not-a-mint', timeFrom: 1, timeTo: 2, fetchImpl }),
    /Invalid Solana token mint/,
  );
  await assert.rejects(
    fetchTokenChart({ apiKey: 'k', mint: MINT, timeFrom: 200, timeTo: 100, fetchImpl }),
    /Invalid Solana Tracker chart window/,
  );
  assert.equal(calls.length, 0);
});

// A refused-everything response must be distinguishable from a per-token
// failure: an exhausted plan would otherwise burn the retry budget of every
// pending mint in a single run.
test('provider-wide refusals are distinguishable so the caller can stop cleanly', async () => {
  for (const status of [401, 402, 403, 429]) {
    const { fetchImpl } = jsonResponder({}, status);
    await assert.rejects(
      fetchTokenChart({ apiKey: 'k', mint: MINT, timeFrom: 100, timeTo: 200, fetchImpl }),
      (error) => error instanceof SolanaTrackerHaltError && error.status === status,
      `status ${status}`,
    );
  }
});

test('a per-token failure stays an ordinary error', async () => {
  const { fetchImpl } = jsonResponder({}, 500);

  await assert.rejects(
    fetchTokenChart({ apiKey: 'k', mint: MINT, timeFrom: 100, timeTo: 200, fetchImpl }),
    (error) => !(error instanceof SolanaTrackerHaltError) && /failed \(500\)/.test(error.message),
  );
});

test('an observation records the window it actually covered', async () => {
  const { calls, fetchImpl } = jsonResponder({
    oclhv: [
      { open: 100, high: 150, low: 90, close: 120, volume: 10, time: 1_700_000_100 },
      { open: 120, high: 302_473, low: 110, close: 200, volume: 40, time: 1_700_000_400 },
    ],
  });

  const observation = await fetchObservedPeak({
    apiKey: 'fixture-secret',
    mint: MINT,
    createdAt: 1_700_000_000_000,
    now: 1_700_090_000_000,
    fetchImpl,
  });

  assert.deepEqual(observation, {
    mint: MINT,
    status: 'ok',
    windowFrom: 1_700_000_000_000,
    windowTo: 1_700_090_000_000,
    candleInterval: '1h',
    candleCount: 2,
    peakMarketCapUsd: 302_473,
    peakAt: 1_700_000_400_000,
  });
  assert.equal(calls[0].url.searchParams.get('time_from'), '1700000000');
});

test('a token with no candles is recorded as empty rather than zero', async () => {
  const { fetchImpl } = jsonResponder({ oclhv: [] });

  const observation = await fetchObservedPeak({
    apiKey: 'fixture-secret',
    mint: MINT,
    createdAt: 1_700_000_000_000,
    now: 1_700_090_000_000,
    fetchImpl,
  });

  assert.equal(observation.status, 'empty');
  assert.equal(observation.candleCount, 0);
  assert.equal('peakMarketCapUsd' in observation, false);
});
