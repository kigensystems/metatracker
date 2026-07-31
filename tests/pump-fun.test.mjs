import { strict as assert } from 'node:assert';
import test from 'node:test';

const helperUrl = new URL(
  '../node_modules/.cache/health-test/netlify/functions/_shared/token-sync.js',
  import.meta.url,
).href;

const {
  enrichTokens,
  fetchGraduatedFromPumpFun,
  pumpMetaFromCoin,
} = await import(helperUrl);

/** A base58 string of mint length, so `isPlausibleSolanaAddress` accepts it. */
function mintOf(seed) {
  return `${seed}${'x'.repeat(Math.max(0, 40 - seed.length))}pump`;
}

/**
 * Swaps in a routed fetch for one test and always puts the real one back.
 * `routes` maps a substring of the URL to a handler returning a body object.
 */
function withFetch(routes, run) {
  const realFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    const href = String(url);
    calls.push({ url: new URL(href), headers: options?.headers });

    for (const [match, handler] of Object.entries(routes)) {
      if (!href.includes(match)) continue;
      const result = await handler(new URL(href));
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), { status: 200 });
    }

    throw new Error(`unrouted fetch: ${href}`);
  };

  return (async () => {
    try {
      return await run(calls);
    } finally {
      globalThis.fetch = realFetch;
    }
  })();
}

const PUMP = 'frontend-api-v3.pump.fun';
const DEX = 'api.dexscreener.com';

function dexPair(mint, { liquidity = 250_000, marketCap = 500_000 } = {}) {
  return {
    pairs: [{
      chainId: 'solana',
      pairAddress: mintOf('Pair'),
      baseToken: { address: mint, name: 'Fixture', symbol: 'FIX' },
      priceUsd: '0.0005',
      volume: { h24: 120_000 },
      liquidity: { usd: liquidity },
      marketCap,
      priceChange: { h24: 12.5 },
    }],
  };
}

// --- pumpMetaFromCoin --------------------------------------------------------

test('coin metadata maps onto the fields enrichment actually uses', () => {
  assert.deepEqual(
    pumpMetaFromCoin({
      image_uri: 'https://ipfs.io/ipfs/abc',
      website: ' https://example.com/post ',
      twitter: 'https://x.com/fixture',
      telegram: 'https://t.me/fixture',
      usd_market_cap: 741_233.5,
      ath_market_cap: 8_936_981,
      ath_market_cap_timestamp: 1_753_600_000_000,
      market_cap: 4_312.7,
    }),
    {
      image: 'https://ipfs.io/ipfs/abc',
      website: 'https://example.com/post',
      twitter: 'https://x.com/fixture',
      telegram: 'https://t.me/fixture',
      marketCap: 741_233.5,
      athMarketCap: 8_936_981,
      athAt: 1_753_600_000_000,
    },
  );
});

// Creators leave the placeholder in the form field surprisingly often; it would
// otherwise render as a Website link going nowhere.
test('bare protocol placeholders are dropped rather than shown as links', () => {
  const meta = pumpMetaFromCoin({ website: 'https://', twitter: 'http://', telegram: '   ' });
  assert.equal(meta.website, undefined);
  assert.equal(meta.twitter, undefined);
  assert.equal(meta.telegram, undefined);
});

test('absent and zeroed numbers become undefined, not 0', () => {
  const meta = pumpMetaFromCoin({ usd_market_cap: 0, ath_market_cap: null });
  assert.deepEqual(meta, {
    image: undefined,
    website: undefined,
    twitter: undefined,
    telegram: undefined,
    marketCap: undefined,
    athMarketCap: undefined,
    athAt: undefined,
  });
});

// --- fetchGraduatedFromPumpFun ----------------------------------------------

function coin(seed, createdTimestamp, extra = {}) {
  return {
    mint: mintOf(seed),
    symbol: seed,
    created_timestamp: createdTimestamp,
    image_uri: `https://ipfs.io/ipfs/${seed}`,
    ...extra,
  };
}

test('the graduated feed is requested with the filters the cohort depends on', async () => {
  const now = 1_753_600_000_000;

  await withFetch({
    [PUMP]: () => [coin('AAA', now - 1_000), coin('OLD', now - 90_000_000)],
  }, async (calls) => {
    await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);

    const { searchParams } = calls[0].url;
    assert.equal(searchParams.get('complete'), 'true');
    assert.equal(searchParams.get('sort'), 'created_timestamp');
    assert.equal(searchParams.get('order'), 'DESC');
    assert.equal(searchParams.get('includeNsfw'), 'true');
    assert.equal(searchParams.get('offset'), '0');
  });
});

test('paging stops at the window edge instead of walking all history', async () => {
  const now = 1_753_600_000_000;
  const pages = [
    [coin('AAA', now - 1_000), coin('BBB', now - 2_000)],
    [coin('CCC', now - 3_000), coin('OLD', now - 25 * 60 * 60 * 1000)],
    [coin('NEVER', now - 4_000)],
  ];

  await withFetch({
    [PUMP]: (url) => pages[Number(url.searchParams.get('offset')) / 50] ?? [],
  }, async (calls) => {
    const result = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);

    assert.equal(calls.length, 2);
    assert.equal(result.pagesFetched, 2);
    assert.deepEqual(result.tokens.map((token) => token.symbol), ['AAA', 'BBB', 'CCC']);
    assert.equal(result.createdAt.get(mintOf('AAA')), now - 1_000);
    assert.equal(result.meta.get(mintOf('CCC')).image, 'https://ipfs.io/ipfs/CCC');
  });
});

test('rows without a mint or a creation time are skipped, and repeats counted once', async () => {
  const now = 1_753_600_000_000;

  await withFetch({
    [PUMP]: () => [
      coin('AAA', now - 1_000),
      coin('AAA', now - 1_000),
      { symbol: 'NOMINT', created_timestamp: now - 1_000 },
      { mint: mintOf('NOTIME'), symbol: 'NOTIME' },
      coin('OLD', now - 90_000_000),
    ],
  }, async () => {
    const result = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);
    assert.deepEqual(result.tokens.map((token) => token.symbol), ['AAA']);
  });
});

test('a feed error yields an empty cohort rather than a throw mid-sync', async () => {
  await withFetch({
    [PUMP]: () => new Response('nope', { status: 503 }),
  }, async () => {
    const result = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, Date.now());
    assert.deepEqual(result.tokens, []);
    assert.equal(result.pagesFetched, 0);
    assert.equal(result.complete, false);
  });
});

/**
 * The dangerous case is not a feed that is down — that returns nothing and is
 * obvious. It is a feed that dies half way through the walk, which yields a
 * plausible-looking short cohort. `complete` is what lets the sync tell a quiet
 * day from a broken fetch.
 */
test('a page failing mid-walk marks the cohort incomplete', async () => {
  const now = 1_753_600_000_000;
  const pages = [
    [coin('AAA', now - 1_000), coin('BBB', now - 2_000)],
    [coin('CCC', now - 3_000)],
  ];

  await withFetch({
    [PUMP]: (url) => {
      const page = Number(url.searchParams.get('offset')) / 50;
      return pages[page] ?? new Response('upstream died', { status: 503 });
    },
  }, async () => {
    const result = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);

    // Tokens were collected, and they look perfectly reasonable — which is
    // exactly why the flag has to carry the truth instead.
    assert.equal(result.tokens.length, 3);
    assert.equal(result.pagesFetched, 2);
    assert.equal(result.complete, false);
  });
});

test('reaching the window edge or the end of the feed counts as complete', async () => {
  const now = 1_753_600_000_000;

  await withFetch({
    [PUMP]: () => [coin('AAA', now - 1_000), coin('OLD', now - 25 * 60 * 60 * 1000)],
  }, async () => {
    const crossed = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);
    assert.equal(crossed.complete, true);
  });

  await withFetch({
    [PUMP]: (url) => (Number(url.searchParams.get('offset')) === 0 ? [coin('AAA', now - 1_000)] : []),
  }, async () => {
    const exhausted = await fetchGraduatedFromPumpFun(24 * 60 * 60 * 1000, now);
    assert.equal(exhausted.complete, true);
    assert.equal(exhausted.tokens.length, 1);
  });
});

// --- the peak observations enrichment produces -------------------------------

const REAL = mintOf('USOX');

// Recorded as reported. pump.fun's ATH is not screened for wash pumps — see the
// fake-ATH section of docs/HISTORY.md before adding a filter here.
test('a reported ATH becomes a peak observation covering the token\u2019s life', async () => {
  await withFetch({
    [DEX]: (url) => dexPair(url.pathname.split('/').pop(), { liquidity: 484_109 }),
  }, async () => {
    const { peakObservations } = await enrichTokens(
      [{ mint: REAL, symbol: 'USOX', marketCap: 0, tradeCount: 0, vwapPrice: 0 }],
      {
        pumpMeta: new Map([[REAL, { athMarketCap: 45_200_000, athAt: 1_753_500_000_000 }]]),
        createdAt: new Map([[REAL, 1_753_400_000_000]]),
      },
    );

    assert.equal(peakObservations.length, 1);
    assert.equal(peakObservations[0].status, 'ok');
    assert.equal(peakObservations[0].peakMarketCapUsd, 45_200_000);
    assert.equal(peakObservations[0].peakAt, 1_753_500_000_000);
    assert.equal(peakObservations[0].windowFrom, 1_753_400_000_000);
  });
});

test('tokens with no pump.fun metadata enrich exactly as they did before', async () => {
  await withFetch({
    [DEX]: (url) => dexPair(url.pathname.split('/').pop(), { liquidity: 40_000 }),
  }, async () => {
    const { tokens, peakObservations } = await enrichTokens(
      [{ mint: REAL, symbol: 'USOX', marketCap: 61_000, tradeCount: 7, vwapPrice: 0.0004 }],
    );

    assert.deepEqual(peakObservations, []);
    assert.equal(tokens[0].marketCap, 61_000);
    assert.equal(tokens[0].liquidity, 40_000);
    assert.equal(tokens[0].volume24h, 120_000);
  });
});

/**
 * The trap this guards: DexScreener throttles above ~5 req/sec by answering 200
 * with empty volume/liquidity, which no retry or success-rate counter notices.
 * At cohort size an unpaced run would store a whole day of tokens looking as if
 * they had no market at all.
 */
test('DexScreener enrichment stays under the rate ceiling it is throttled by', async () => {
  const tokens = Array.from({ length: 10 }, (_, index) => ({
    mint: mintOf(`T${index}`),
    symbol: `T${index}`,
    marketCap: 0,
    tradeCount: 0,
    vwapPrice: 0,
  }));

  let inFlight = 0;
  let mostConcurrent = 0;

  await withFetch({
    [DEX]: async (url) => {
      inFlight += 1;
      mostConcurrent = Math.max(mostConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return dexPair(url.pathname.split('/').pop());
    },
  }, async (calls) => {
    const startedAt = Date.now();
    const { tokens: enriched } = await enrichTokens(tokens);

    assert.equal(enriched.length, 10);
    assert.equal(calls.length, 10);
    assert.ok(mostConcurrent <= 5, `expected at most 5 in flight, saw ${mostConcurrent}`);
    // Two batches of five means one full second of spacing between them.
    assert.ok(
      Date.now() - startedAt >= 1_000,
      'batches were issued without the spacing that keeps the run under 5 req/sec',
    );
  });
});

test('pump.fun supplies market cap, art and links when DexScreener has none', async () => {
  await withFetch({
    [DEX]: (url) => dexPair(url.pathname.split('/').pop(), { liquidity: 20_000, marketCap: 0 }),
  }, async () => {
    const { tokens } = await enrichTokens(
      [{ mint: REAL, symbol: 'USOX', marketCap: 0, tradeCount: 0, vwapPrice: 0 }],
      {
        pumpMeta: new Map([[REAL, {
          image: 'https://ipfs.io/ipfs/art',
          website: 'https://tiktok.com/@origin',
          twitter: 'https://x.com/usox',
          marketCap: 741_233,
        }]]),
        createdAt: new Map([[REAL, 1_753_400_000_000]]),
      },
    );

    assert.equal(tokens[0].marketCap, 741_233);
    assert.equal(tokens[0].image, 'https://ipfs.io/ipfs/art');
    assert.equal(tokens[0].website, 'https://tiktok.com/@origin');
    assert.equal(tokens[0].twitter, 'https://x.com/usox');
    assert.equal(tokens[0].createdAt, 1_753_400_000_000);
  });
});
