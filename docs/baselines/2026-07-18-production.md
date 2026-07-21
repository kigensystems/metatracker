# Production compatibility baseline — 2026-07-18

This baseline records the current production iteration before the data and UI
work in `PLAN.md`. It contains no credentials, raw provider responses, or mint
addresses.

## API response shape

`GET /api/graduated?mode=live` currently returns:

```text
tokens[]
  mint, name, symbol, image, bannerImage
  priceUsd, volume24h, liquidity, marketCap, priceChange24h
  tradeCount, createdAt, dexScreenerUrl
  website, twitter, telegram
  links.dexscreener, links.birdeye, links.solscan
totalCount, fetchedAt, duneExecutionEndedAt
source, snapshotDate
enrichment.failedCount, enrichment.successRate
```

A cached live response retains the token shape and adds or uses:

```text
latestDuneExecutionEndedAt, isStale, staleReason
source = cache | cache-stale
```

`GET /api/graduated?mode=historical&date=YYYY-MM-DD` retains the token
shape and returns:

```text
totalCount, snapshotDate, capturedAt, duneExecutionEndedAt
source = historical, dateMode = rolling-snapshot
```

The executable sanitized fixtures live in `tests/fixtures/frontend/`.

## Frontend states

- Live data: rolling 24-hour tab, freshness bar, four summary measurements,
  sortable token table, pagination, and token detail drawer.
- Historical data: selected rolling-snapshot date with the same current token
  fields; no peak label is inferred.
- Partial enrichment: missing DexScreener values render through the existing
  null/empty fallbacks.
- Loading, error, and empty states remain separate states.

## Representative screenshots

- `production-desktop.jpg`: desktop live table view (1429 x 992 capture).
- `production-mobile.jpg`: mobile live table view (379 x 820 capture).

The screenshots are visual references only. Dynamic token names, values, and
freshness timestamps are expected to change; layout and state semantics are the
comparison contract.
