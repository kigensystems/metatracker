import { strict as assert } from 'node:assert';
import test from 'node:test';

const helperUrl = new URL(
  '../node_modules/.cache/health-test/netlify/functions/_shared/solana-tracker.js',
  import.meta.url,
).href;

const {
  calculateObservedPeak,
  derivePeakSupply,
  enrichObservedPeaks,
  fetchSolanaTrackerChart,
  parseSolanaTrackerChart,
} = await import(helperUrl);

test('Solana Tracker chart parsing accepts its current oclhv response shape', () => {
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

test('observed peak includes the highest wick and uses verified supply', () => {
  const result = calculateObservedPeak([
    { open: 0.0001, high: 0.0002, low: 0.0001, close: 0.00015, volume: 75, time: 100 },
    { open: 0.0002, high: 0.0008, low: 0.0002, close: 0.0005, volume: 250, time: 200 },
  ], 1_000_000_000);

  assert.deepEqual(result, {
    marketCapUsd: 800_000,
    priceUsd: 0.0008,
    observedAt: 200_000,
    candleVolume: 250,
  });
});

test('peak supply prefers matching-time Dex values and falls back to Dune', () => {
  assert.deepEqual(derivePeakSupply({
    mint: 'Mint',
    symbol: 'DEX',
    name: 'Dex',
    dexMarketCap: 250_000,
    dexPriceUsd: 0.00025,
    duneMarketCap: 200_000,
    duneVwapPrice: 0.0002,
    linksJson: '{}',
    dexScreenerUrl: '',
  }), { amount: 1_000_000_000, source: 'dexscreener' });

  assert.deepEqual(derivePeakSupply({
    mint: 'Mint',
    symbol: 'DUNE',
    name: 'Dune',
    duneMarketCap: 200_000,
    duneVwapPrice: 0.0002,
    linksJson: '{}',
    dexScreenerUrl: '',
  }), { amount: 1_000_000_000, source: 'dune' });
});

test('peak enrichment fetches once and carries the result into later snapshots', async () => {
  const baseToken = {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'PEAK',
    name: 'Peak',
    dexMarketCap: 200_000,
    dexPriceUsd: 0.0002,
    createdAt: 1_700_000_000_000,
    linksJson: '{}',
    dexScreenerUrl: '',
  };
  let calls = 0;
  const fetchChart = async () => {
    calls += 1;
    return [{ open: 0.0002, high: 0.0009, low: 0.0001, close: 0.0004, volume: 1, time: 1_700_000_100 }];
  };

  const first = await enrichObservedPeaks([baseToken], [], 'fixture-key', {
    now: 1_700_001_000_000,
    pauseMs: 0,
    fetchChart,
  });
  assert.equal(calls, 1);
  assert.equal(first.fetchedCount, 1);
  assert.deepEqual(first.fetchedMints, [baseToken.mint]);
  assert.equal(first.tokens[0].observedPeakMarketCap, 900_000);
  assert.equal(first.tokens[0].observedPeakSource, 'solana-tracker');
  assert.equal(first.tokens[0].observedPeakSupplySource, 'dexscreener');

  const second = await enrichObservedPeaks([baseToken], first.tokens, 'fixture-key', {
    now: 1_700_002_000_000,
    pauseMs: 0,
    fetchChart,
  });
  assert.equal(calls, 1, 'stored peak is reused without another provider request');
  assert.equal(second.reusedCount, 1);
  assert.equal(second.tokens[0].observedPeakMarketCap, 900_000);
});

test('peak enrichment caps failed provider attempts per sync', async () => {
  let calls = 0;
  const tokens = ['So11111111111111111111111111111111111111112',
    '22222222222222222222222222222222',
    '33333333333333333333333333333333'].map((mint) => ({
    mint,
    symbol: 'FAIL',
    name: 'Failure',
    duneMarketCap: 100_000,
    duneVwapPrice: 0.0001,
    linksJson: '{}',
    dexScreenerUrl: '',
  }));

  const result = await enrichObservedPeaks(tokens, [], 'fixture-key', {
    maxFetches: 2,
    pauseMs: 0,
    fetchChart: async () => {
      calls += 1;
      throw new Error('provider unavailable');
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.attemptedCount, 2);
  assert.equal(result.fetchedCount, 0);
  assert.equal(result.failedMints.length, 2);
});

test('chart requests keep the API key in the header and bound the time window', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedHeaders;

  globalThis.fetch = async (url, options) => {
    capturedUrl = new URL(url);
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({ oclhv: [] }), { status: 200 });
  };

  try {
    const candles = await fetchSolanaTrackerChart({
      apiKey: 'fixture-secret',
      mint: 'So11111111111111111111111111111111111111112',
      timeFrom: 100.9,
      timeTo: 200.9,
    });

    assert.deepEqual(candles, []);
    assert.equal(capturedUrl.origin, 'https://data.solanatracker.io');
    assert.equal(capturedUrl.searchParams.get('type'), '1m');
    assert.equal(capturedUrl.searchParams.get('timeFrom'), '100');
    assert.equal(capturedUrl.searchParams.get('timeTo'), '200');
    assert.equal(capturedUrl.searchParams.get('currency'), 'usd');
    assert.equal(capturedHeaders['x-api-key'], 'fixture-secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chart parsing rejects payloads without candles', () => {
  assert.throws(
    () => parseSolanaTrackerChart({ error: 'unexpected shape' }),
    /no candle array/,
  );
});
