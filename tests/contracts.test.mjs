import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cacheRoot = new URL('../node_modules/.cache/health-test/', import.meta.url);
const tokenSyncUrl = new URL('netlify/functions/_shared/token-sync.js', cacheRoot).href;
const apiContractUrl = new URL('netlify/functions/_shared/api-contract.js', cacheRoot).href;
const snapshotGuardsUrl = new URL('convex/snapshot_guards.js', cacheRoot).href;
const observedPeakBudgetUrl = new URL('convex/observed_peak_budget.js', cacheRoot).href;
const tokenValidatorUrl = new URL('convex/token_validator.js', cacheRoot).href;
const frontendContractUrl = new URL('src/lib/api-contract.js', cacheRoot).href;
const externalUrl = new URL('src/lib/external-url.js', cacheRoot).href;

const { enrichTokens, fetchLatestDuneData } = await import(tokenSyncUrl);
const { safeHttpUrl, toApiToken } = await import(apiContractUrl);
const {
  assertSourceExecutionNotOlder,
  evaluateSnapshotReplacement,
  getSnapshotMergeStats,
  validateSnapshotInput,
} = await import(snapshotGuardsUrl);
const { storedTokenValidator, tokenValidator } = await import(tokenValidatorUrl);
const { getMonthlyRequestPeriod, grantProviderRequests } = await import(observedPeakBudgetUrl);
const { parseGraduatedPayload } = await import(frontendContractUrl);
const { safeExternalUrl } = await import(externalUrl);

async function fixture(path) {
  const contents = await readFile(new URL(`fixtures/${path}`, import.meta.url), 'utf8');
  return JSON.parse(contents);
}

async function parseDuneFixture(path) {
  const payload = await fixture(path);
  return parseDunePayload(payload);
}

async function parseDunePayload(payload) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });

  try {
    return await fetchLatestDuneData('fixture-key', String(payload.query_id));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Dune responses without a real execution timestamp are rejected', async () => {
  const payload = await fixture('dune/current-response.json');
  delete payload.execution_ended_at;

  await assert.rejects(
    () => parseDunePayload(payload),
    /invalid execution timestamp/,
  );
});

test('current and extended Dune rows both parse during the transition', async () => {
  const current = await parseDuneFixture('dune/current-response.json');
  const extended = await parseDuneFixture('dune/extended-response.json');

  assert.deepEqual(current.tokens, [{
    mint: 'CurrentFixtureMint11111111111111111111111111111',
    symbol: 'CURRENT',
    marketCap: 125000,
    tradeCount: 321,
    vwapPrice: 0.000125,
    sourceExecutionEndedAt: '2026-07-18T12:00:00.000Z',
  }]);
  assert.deepEqual(extended.tokens, [{
    mint: 'ExtendedFixtureMint111111111111111111111111111',
    symbol: 'EXTENDED',
    marketCap: 250000,
    tradeCount: 654,
    vwapPrice: 0.00025,
    graduatedAt: 1784374200000,
    observedPeakMarketCap: 900000,
    observedPeakAt: 1784376900000,
    measuredVolumeUsd: 750000,
    buyCount: 400,
    sellCount: 254,
    sourceExecutionEndedAt: '2026-07-18T14:00:00.000Z',
  }]);
});

test('extended Dune fields survive enrichment and the real API mapper', async () => {
  const parsed = await parseDuneFixture('dune/extended-response.json');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 404 });

  try {
    const enriched = await enrichTokens(parsed.tokens);
    const apiToken = toApiToken(enriched.tokens[0]);

    assert.equal(apiToken.graduatedAt, 1784374200000);
    assert.equal(apiToken.observedPeakMarketCap, 900000);
    assert.equal(apiToken.observedPeakAt, 1784376900000);
    assert.equal(apiToken.measuredVolumeUsd, 750000);
    assert.equal(apiToken.buyCount, 400);
    assert.equal(apiToken.sellCount, 254);
    assert.equal(apiToken.sourceExecutionEndedAt, '2026-07-18T14:00:00.000Z');
    assert.equal(apiToken.duneMarketCap, 250000);
    assert.equal(apiToken.duneVwapPrice, 0.00025);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Dex enrichment keeps only a validated base-token pair and records both source values', async () => {
  const mint = 'So11111111111111111111111111111111111111112';
  const selectedPairAddress = '22222222222222222222222222222222';
  const originalFetch = globalThis.fetch;
  const capturedAfter = Date.now();
  const makePair = ({
    pairAddress,
    baseAddress = mint,
    liquidity = 1000,
    name = 'Selected token',
    marketCap = 210000,
  }) => ({
    chainId: 'solana',
    pairAddress,
    baseToken: { address: baseAddress, name, symbol: 'PAIR' },
    priceUsd: '0.00021',
    volume: { h24: 765432 },
    liquidity: { usd: liquidity },
    marketCap,
    priceChange: { h24: 12.5 },
    pairCreatedAt: 1784374200000,
    info: {},
  });

  globalThis.fetch = async () => new Response(JSON.stringify({
    pairs: [
      makePair({
        pairAddress: '33333333333333333333333333333333',
        baseAddress: '44444444444444444444444444444444',
        liquidity: 999999,
        name: 'Wrong base token',
      }),
      makePair({ pairAddress: 'not-a-solana-address', liquidity: 900000 }),
      makePair({ pairAddress: selectedPairAddress, liquidity: 50000 }),
      makePair({ pairAddress: '55555555555555555555555555555555', liquidity: 10000 }),
    ],
  }), { status: 200 });

  try {
    const result = await enrichTokens([{
      mint,
      symbol: 'DUNE',
      marketCap: 123456,
      tradeCount: 321,
      vwapPrice: 0.000123,
      sourceExecutionEndedAt: '2026-07-18T14:00:00.000Z',
    }]);
    const stored = result.tokens[0];

    assert.equal(result.failedEnrichments.length, 0);
    assert.equal(stored.name, 'Selected token');
    assert.equal(stored.marketCap, 123456, 'legacy marketCap keeps its Dune-first meaning');
    assert.equal(stored.priceUsd, 0.000123, 'legacy priceUsd keeps its Dune-first meaning');
    assert.equal(stored.duneMarketCap, 123456);
    assert.equal(stored.duneVwapPrice, 0.000123);
    assert.equal(stored.dexMarketCap, 210000);
    assert.equal(stored.dexPriceUsd, 0.00021);
    assert.equal(stored.dexPairAddress, selectedPairAddress);
    assert.ok(stored.dexFetchedAt >= capturedAfter);
    assert.equal(stored.dexScreenerUrl, `https://dexscreener.com/solana/${selectedPairAddress}`);
    assert.equal(JSON.parse(stored.linksJson).dexscreener, stored.dexScreenerUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('API token contract preserves every current field and null fallback', () => {
  const token = toApiToken({
    mint: 'ApiFixtureMint1111111111111111111111111111111',
    name: 'API Fixture',
    symbol: 'API',
    marketCap: 125000,
    volume24h: Number.NaN,
    linksJson: '{malformed',
  });

  assert.deepEqual(token, {
    mint: 'ApiFixtureMint1111111111111111111111111111111',
    name: 'API Fixture',
    symbol: 'API',
    image: null,
    bannerImage: null,
    priceUsd: null,
    volume24h: null,
    liquidity: null,
    marketCap: 125000,
    priceChange24h: null,
    tradeCount: null,
    createdAt: null,
    dexScreenerUrl: null,
    website: null,
    twitter: null,
    telegram: null,
    links: {
      dexscreener: 'https://dexscreener.com/solana/ApiFixtureMint1111111111111111111111111111111',
      birdeye: 'https://birdeye.so/token/ApiFixtureMint1111111111111111111111111111111?chain=solana',
      solscan: 'https://solscan.io/token/ApiFixtureMint1111111111111111111111111111111',
    },
  });
});

test('real API mapper adds extended fields without changing the current token contract', () => {
  const stored = {
    mint: 'ExtendedFixtureMint111111111111111111111111111',
    name: 'Extended Fixture',
    symbol: 'EXTENDED',
    linksJson: '{}',
  };
  const current = toApiToken(stored);
  const extended = toApiToken({
    ...stored,
    graduatedAt: 1784374200000,
    observedPeakMarketCap: 900000,
    observedPeakAt: 1784376900000,
    observedPeakPriceUsd: 0.0009,
    observedPeakFetchedAt: 1784383500000,
    observedPeakSource: 'solana-tracker',
    observedPeakSupply: 1_000_000_000,
    observedPeakSupplySource: 'dexscreener',
    measuredVolumeUsd: 750000,
    buyCount: 400,
    sellCount: 254,
    sourceExecutionEndedAt: '2026-07-18T14:00:00.000Z',
    duneMarketCap: 250000,
    duneVwapPrice: 0.00025,
    dexMarketCap: 275000,
    dexPriceUsd: 0.000275,
    dexFetchedAt: 1784383500000,
    dexPairAddress: '22222222222222222222222222222222',
  });
  const currentKeys = Object.keys(current).sort();
  const sharedExtended = Object.fromEntries(currentKeys.map((key) => [key, extended[key]]));

  assert.deepEqual(Object.keys(sharedExtended).sort(), currentKeys);
  assert.deepEqual(sharedExtended, current);
  assert.equal('observedPeakMarketCap' in current, false);
  assert.equal(extended.observedPeakMarketCap, 900000);
  assert.equal(extended.observedPeakSource, 'solana-tracker');
  assert.equal(extended.observedPeakSupplySource, 'dexscreener');
  assert.equal(extended.measuredVolumeUsd, 750000);
  assert.equal(extended.duneMarketCap, 250000);
  assert.equal(extended.dexMarketCap, 275000);
  assert.equal(extended.dexPairAddress, '22222222222222222222222222222222');
});

test('API and frontend URL guards allow only HTTP(S) destinations', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,bad', 'not a URL']) {
    assert.equal(safeHttpUrl(value), null);
    assert.equal(safeExternalUrl(value), null);
  }

  assert.equal(safeHttpUrl('https://example.invalid/path'), 'https://example.invalid/path');
  assert.equal(safeExternalUrl('http://example.invalid'), 'http://example.invalid');

  const token = toApiToken({
    mint: 'SafeLinksMint111111111111111111111111111111',
    website: 'javascript:alert(1)',
    twitter: 'https://x.com/safe',
    linksJson: JSON.stringify({
      dexscreener: 'data:text/html,bad',
      birdeye: 'https://birdeye.so/safe',
    }),
  });

  assert.equal(token.website, null);
  assert.equal(token.twitter, 'https://x.com/safe');
  assert.match(token.links.dexscreener, /^https:\/\/dexscreener\.com\//);
  assert.equal(token.links.birdeye, 'https://birdeye.so/safe');
});

test('storage guards accept old and additive token documents without weakening write safety', () => {
  const oldToken = { mint: 'OldMint', symbol: 'OLD', marketCap: 1000 };
  const extendedToken = { ...oldToken, observedPeakMarketCap: 5000, buyCount: 25, sellCount: 10 };
  const today = '2026-07-18';
  const additiveFields = [
    'graduatedAt',
    'observedPeakMarketCap',
    'observedPeakAt',
    'observedPeakPriceUsd',
    'observedPeakFetchedAt',
    'observedPeakSource',
    'observedPeakSupply',
    'observedPeakSupplySource',
    'measuredVolumeUsd',
    'buyCount',
    'sellCount',
    'sourceExecutionEndedAt',
    'duneMarketCap',
    'duneVwapPrice',
    'dexMarketCap',
    'dexPriceUsd',
    'dexFetchedAt',
    'dexPairAddress',
  ];

  for (const field of additiveFields) {
    assert.equal(tokenValidator.fields[field]?.isOptional, 'optional', field);
    assert.equal(storedTokenValidator.fields[field]?.isOptional, 'optional', field);
  }
  assert.equal(storedTokenValidator.fields.snapshotDate?.isOptional, 'required');

  assert.doesNotThrow(() => validateSnapshotInput({
    date: today,
    tokens: [oldToken, extendedToken],
    sourceMetadata: { state: 'QUERY_STATE_COMPLETED', rowCount: 2, totalRowCount: 2 },
  }, today));

  assert.throws(() => validateSnapshotInput({
    date: today,
    tokens: [],
  }, today), /empty snapshot/);

  assert.throws(() => validateSnapshotInput({
    date: '2026-07-17',
    tokens: [oldToken],
  }, today), /Cannot overwrite historical data/);

  assert.throws(() => validateSnapshotInput({
    date: today,
    tokens: [oldToken],
    sourceMetadata: { state: 'QUERY_STATE_FAILED', rowCount: 1, totalRowCount: 1 },
  }, today), /incomplete Dune result/);

  assert.throws(() => validateSnapshotInput({
    date: today,
    tokens: [oldToken],
    sourceMetadata: { state: 'QUERY_STATE_COMPLETED', rowCount: 1, totalRowCount: 2 },
  }, today), /partial Dune result/);

  assert.throws(() => validateSnapshotInput({
    date: today,
    tokens: [oldToken],
    sourceMetadata: { state: 'QUERY_STATE_COMPLETED', rowCount: 2, totalRowCount: 2 },
  }, today), /malformed Dune result/);
});

test('source execution timestamps cannot move stored state backward', () => {
  assert.doesNotThrow(() => assertSourceExecutionNotOlder(
    '2026-07-18T14:00:00.000Z',
    '2026-07-18T14:00:00.000Z',
  ));
  assert.doesNotThrow(() => assertSourceExecutionNotOlder(
    '2026-07-18T16:00:00.000Z',
    '2026-07-18T14:00:00.000Z',
  ));
  assert.throws(() => assertSourceExecutionNotOlder(
    '2026-07-18T12:00:00.000Z',
    '2026-07-18T14:00:00.000Z',
  ), /older source result/);
  assert.throws(() => assertSourceExecutionNotOlder(
    'not-a-date',
    '2026-07-18T14:00:00.000Z',
  ), /invalid execution timestamp/);
});

test('storage replacement and retention decisions remain compatible', () => {
  assert.deepEqual(evaluateSnapshotReplacement({
    incomingTokenCount: 100,
    existingTokenCount: 100,
    replaceExisting: false,
  }), { skip: true, reason: 'snapshot-exists' });

  assert.throws(() => evaluateSnapshotReplacement({
    incomingTokenCount: 49,
    existingTokenCount: 100,
  }), /possible partial upstream response/);

  assert.deepEqual(evaluateSnapshotReplacement({
    incomingTokenCount: 49,
    existingTokenCount: 100,
    allowPartialOverwrite: true,
  }), { skip: false });

  assert.deepEqual(evaluateSnapshotReplacement({
    incomingTokenCount: 1,
    existingTokenCount: 100,
    existingSnapshotTokenCount: 0,
    replaceExisting: false,
  }), { skip: false });
});

test('daily observed unions retain disappearing tokens without duplicating mints', () => {
  assert.deepEqual(
    getSnapshotMergeStats(
      [{ mint: 'A' }, { mint: 'B' }, { mint: 'C' }],
      [{ mint: 'B' }, { mint: 'D' }],
    ),
    { incomingCount: 2, preservedCount: 2, finalCount: 4 },
  );

  assert.throws(
    () => getSnapshotMergeStats([{ mint: 'A' }], [{ mint: 'B' }, { mint: 'B' }]),
    /duplicate token mints/,
  );
});

test('monthly provider budget grants only the remaining safe allowance', () => {
  assert.equal(getMonthlyRequestPeriod(Date.parse('2026-07-22T12:00:00.000Z')), '2026-07');
  assert.deepEqual(
    grantProviderRequests({ used: 2_198, requested: 8, limit: 2_200 }),
    { granted: 2, usedAfter: 2_200, remaining: 0 },
  );
  assert.deepEqual(
    grantProviderRequests({ used: 2_200, requested: 8, limit: 2_200 }),
    { granted: 0, usedAfter: 2_200, remaining: 0 },
  );
});

test('frontend accepts live, historical, partial, and extended fixtures', async () => {
  const now = Date.parse('2026-07-18T16:00:00.000Z');
  const cases = [
    ['frontend/current-live.json', 'live'],
    ['frontend/historical-old.json', 'historical'],
    ['frontend/partial-enrichment.json', 'live'],
    ['frontend/extended.json', 'live'],
  ];

  for (const [path, source] of cases) {
    const parsed = parseGraduatedPayload(await fixture(path), now);
    assert.equal(parsed.tokens.length, 1, path);
    assert.equal(parsed.freshness.source, source, path);
    assert.equal(parsed.freshness.totalCount, 1, path);
    assert.equal(Number.isNaN(parsed.updatedAt.getTime()), false, path);
  }

  const historical = parseGraduatedPayload(await fixture('frontend/historical-old.json'), now);
  assert.equal(historical.freshness.enrichment, null);
  assert.equal('observedPeakMarketCap' in historical.tokens[0], false);

  const partial = parseGraduatedPayload(await fixture('frontend/partial-enrichment.json'), now);
  assert.deepEqual(partial.freshness.enrichment, { failedCount: 1, successRate: 0 });
  assert.equal(partial.tokens[0].volume24h, null);

  const extended = parseGraduatedPayload(await fixture('frontend/extended.json'), now);
  assert.equal(extended.tokens[0].observedPeakMarketCap, 900000);
  assert.equal(extended.tokens[0].duneMarketCap, 250000);
  assert.equal(extended.tokens[0].dexMarketCap, 275000);
});
