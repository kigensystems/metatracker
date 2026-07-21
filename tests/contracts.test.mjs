import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cacheRoot = new URL('../node_modules/.cache/health-test/', import.meta.url);
const tokenSyncUrl = new URL('netlify/functions/_shared/token-sync.js', cacheRoot).href;
const apiContractUrl = new URL('netlify/functions/_shared/api-contract.js', cacheRoot).href;
const snapshotGuardsUrl = new URL('convex/snapshot-guards.js', cacheRoot).href;
const tokenValidatorUrl = new URL('convex/token-validator.js', cacheRoot).href;
const frontendContractUrl = new URL('src/lib/api-contract.js', cacheRoot).href;
const externalUrl = new URL('src/lib/external-url.js', cacheRoot).href;

const { enrichTokens, fetchLatestDuneData } = await import(tokenSyncUrl);
const { safeHttpUrl, toApiToken } = await import(apiContractUrl);
const {
  assertSourceExecutionNotOlder,
  evaluateSnapshotReplacement,
  validateSnapshotInput,
} = await import(snapshotGuardsUrl);
const { storedTokenValidator, tokenValidator } = await import(tokenValidatorUrl);
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
    measuredVolumeUsd: 750000,
    buyCount: 400,
    sellCount: 254,
    sourceExecutionEndedAt: '2026-07-18T14:00:00.000Z',
  });
  const currentKeys = Object.keys(current).sort();
  const sharedExtended = Object.fromEntries(currentKeys.map((key) => [key, extended[key]]));

  assert.deepEqual(Object.keys(sharedExtended).sort(), currentKeys);
  assert.deepEqual(sharedExtended, current);
  assert.equal('observedPeakMarketCap' in current, false);
  assert.equal(extended.observedPeakMarketCap, 900000);
  assert.equal(extended.measuredVolumeUsd, 750000);
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
    'measuredVolumeUsd',
    'buyCount',
    'sellCount',
    'sourceExecutionEndedAt',
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
});
