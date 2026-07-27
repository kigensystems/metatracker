# meta.tracker

Dashboard for tracking newly graduated Solana tokens from Dune, enriched with
DexScreener market data and social links. React/Vite frontend, Netlify Functions
for API/runtime work, and Convex for durable snapshots, sync audit, and
historical browsing.

Canonical agent instructions: [AGENTS.md](AGENTS.md). Claude compatibility:
[CLAUDE.md](CLAUDE.md). Forward plan: [PLAN.md](PLAN.md). Incident history +
changelog: [docs/HISTORY.md](docs/HISTORY.md).

## Production

- Site: `https://metratrackerapp.netlify.app`
- Repo: `https://github.com/kigensystems/metatracker`
- Live Convex (configured in Netlify): `dusty-ox-307.convex.cloud`
- A second Convex deployment exists: `qualified-hound-245`

Netlify production reads `dusty-ox-307`, where the live data is. Switching
`CONVEX_URL` to `qualified-hound-245` is a deliberate data migration, not a
casual change.

## Architecture

```text
Dune query results
  -> Netlify Functions
  -> Convex daily observed-token unions and sync audit tables
  -> React frontend

DexScreener enrichment and bounded Solana Tracker observed-peak lookups run in
Netlify Functions before snapshot writes.
```

Core production flow:

1. Netlify scheduled function runs every 2 hours (00:00, 02:00, … 22:00 UTC).
2. Fetches Dune query `4124453`.
3. Enriches tokens through DexScreener in batches.
4. Refreshes a bounded number of missing observed peaks through Solana Tracker.
5. Merges the result into that UTC date's observed-token union in Convex.
6. Writes source metadata and sync audit data.
7. Frontend reads live/historical data through Netlify `/api/*` endpoints.

Live/manual and scheduled paths share the same Dune parsing, result-completeness
guards, token-link generation, and batched DexScreener enrichment. Only
scheduled syncs and admin backfills write durable snapshots and advance
`duneMetadata`; browser/manual refreshes may return live data but must not
advance durable metadata unless they also store a matching snapshot.

## Data Sources

### Dune

Main query `4124453` — a third-party public query owned by `adam_tehc`. Returns
`token_address`, `asset`, `market_cap`, `trade_count`, `vwap_token_price`. It is
a rolling recent-window query, already filtered upstream for recently graduated
tokens with meaningful trade activity and real DEX volume; recheck the query
before changing product assumptions about coverage.

Backfill query `7746626` — accepts `window_start` and `window_end`, returns the
same columns, and is used by `POST /api/backfill`.

### DexScreener

`https://api.dexscreener.com/latest/dex/tokens/{mint}` — token name, image,
banner (`info.header`, ~72% coverage), market cap, volume, liquidity, 24h price
change, website, X/Twitter, and pair creation timestamp.

### Solana Tracker

The chart endpoint supplies one-minute USD candles for the bounded observed-peak
enrichment queue. Peaks are cached permanently by mint and copied back to every
stored daily row, so later dates do not spend another request for the same
token. The highest observed candle market cap is retained across later syncs.
This metric is labeled **observed peak market cap**, not ATH, because coverage
begins when a token enters the stored cohort and is not yet proven complete for
the token's full lifetime.

Provider usage is guarded by an atomic 2,200-request monthly budget, leaving 300
of the free plan's 2,500 requests as operational headroom. Each sync can reserve
at most eight chart requests. Captured tokens that are still missing peaks stay
in the retained queue and are processed oldest-first; reaching the budget never
removes them from the dashboard.

## Cache and Snapshot Rules

The live API uses Dune metadata to decide whether Convex has the latest
scheduled snapshot. `source` values:

- `cache` — Convex snapshot matches the latest Dune execution metadata.
- `cache-stale` — Convex has data, but Dune metadata indicates newer source data exists.
- `live` — Dune fetched directly for this request, without advancing durable Convex metadata.
- `historical` — Convex snapshot for a requested historical date.

Only scheduled syncs and admin backfills write durable snapshots. Live/manual
requests must not update `duneMetadata` unless a matching snapshot is also stored.

## Scheduled Sync

Schedule: `0 */2 * * *` (UTC) — every 2 hours. The scheduled Netlify background function:

1. Records a best-effort `syncRuns` start row for the expected cron slot.
2. Fetches the Dune result with bounded retries.
3. Enriches tokens through DexScreener in batches.
4. Refreshes a bounded number of missing observed peaks through Solana Tracker.
5. Merges incoming mints into the current UTC day's retained token set.
6. Stores the latest source metadata and updates `duneMetadata`.
7. Patches the `syncRuns` row with both incoming and retained token counts.

New daily snapshots retain the union of every mint observed by a successful
scheduled source query during that UTC date. A token that disappears from a
later rolling query is not deleted. Each incoming mint is refreshed with its
newest enrichment, while absent mints keep their last stored values. Older
snapshots created before this capture mode remain final rolling snapshots and
are labeled accordingly.

The union prevents app-side deletion gaps; it cannot prove that the upstream
source observed a token that appeared and disappeared entirely between source
executions. Operational health should come from `syncRuns` and `/api/health`,
not snapshot presence. Snapshot dates mark the UTC day on which tokens were
observed, not token-created calendar-day buckets.

## Frontend Behavior

- Header: logo, last-updated, next-sync countdown (every 2h), refresh.
- "Current meta" summary strip: top volume, top gainer, top market cap, total
  24h volume (each token card opens that token's drawer).
- Date picker: latest data plus recent UTC observation dates; tooltips identify
  daily observed unions versus older final rolling snapshots.
- Token table: sortable by 24h volume (default), market cap, or 24h % change;
  volume + market cap + color-coded 24h % inline; 50-row pagination; row →
  detail drawer (banner, full stats, DexScreener / Birdeye / Solscan / website /
  X links).
- Empty historical snapshots are filtered out.
- Manual browser refresh only bypasses the client cache; it does not send
  `force=true`.

## Runtime Endpoints

All routes are exposed through Netlify redirects under `/api/*`.

### `GET /api/graduated`

| Param | Values | Notes |
| --- | --- | --- |
| `mode` | `live`, `historical`, `check-freshness` | Defaults to `live`. |
| `date` | `YYYY-MM-DD` | Required for `historical`. |
| `force` | `true` | Admin-only; requires `x-admin-refresh-token`. |

Unauthenticated `force=true` returns `403`.

When an extended Dune query is introduced, optional token fields such as
`graduatedAt`, `observedPeakMarketCap`, `observedPeakAt`, `measuredVolumeUsd`,
`buyCount`, `sellCount`, and `sourceExecutionEndedAt` pass through additively.
They are omitted for old snapshots, so the current API contract remains valid.

### `GET /api/available-dates`

Recent Convex snapshot dates + token counts for the date picker (rolling
snapshots for legacy dates and retained observed-token unions for new dates).

### `GET /api/health`

Read-only health endpoint backed by Convex sync audit data and daily snapshots;
it does not call Dune. Health requires both a successful app sync within ~4.5h
(two 2h intervals + grace) and a Dune execution within ~6.5h. This prevents a
sync that repeatedly downloads an old completed result from staying green.
Healthy:

```json
{ "ok": true, "latestSuccess": { "status": "success" }, "syncAgeMinutes": 12, "staleAfterMinutes": 270, "duneAgeMinutes": 85, "duneStaleAfterMinutes": 390 }
```

Returns `503` when no recent successful `syncRuns` record exists, or when that
run used a missing, malformed, or stale Dune execution timestamp.

### `POST /api/backfill`

Admin-only historical repair. Requires `x-admin-refresh-token` matching
`ADMIN_REFRESH_TOKEN`. Dry run:

```bash
curl -X POST \
  -H "x-admin-refresh-token: $ADMIN_REFRESH_TOKEN" \
  "https://metratrackerapp.netlify.app/api/backfill?date=YYYY-MM-DD&dryRun=true"
```

Idempotent by default: if the date already has a non-empty snapshot it returns
`skipped: true` / `wouldSkipExisting: true` unless `replaceExisting=true` is
passed. Do not run a real backfill casually — it executes Dune and can replace
data.

## Monitoring and Alerts

`.github/workflows/health-monitor.yml` is configured six times per hour, offset
from the top of the hour, and checks
`https://metratrackerapp.netlify.app/api/health`. On failure it opens or
comments on one GitHub issue (`meta.tracker scheduled sync health failing`) and
fails the Actions run; on recovery it closes the issue. This is GitHub-native
notification only (no Slack/Discord/SMS/PagerDuty unless wired up). GitHub may
delay or drop scheduled runs, so the cron expression is not a ten-minute delivery
guarantee.

When an alert opens:

1. Open `/api/health`; check `syncAgeMinutes`, `latestSuccess`, `latestRun`, `latestSnapshot`.
2. Check Netlify function logs for `scheduled-sync`.
3. If a slot is missing and Dune access works, start with a `dryRun=true` backfill check.
4. Don't run `replaceExisting=true` until you've confirmed the existing snapshot is missing or bad.

## Environment Variables

```text
DUNE_API_KEY
CONVEX_URL
CONVEX_DEPLOYMENT
ADMIN_REFRESH_TOKEN
DUNE_BACKFILL_QUERY_ID=7746626
SOLANA_TRACKER_API_KEY
```

Never print or commit real values; `.env.example` holds placeholders only.

## Development

```bash
npm install
npx convex dev        # Convex locally
npx netlify dev       # Vite + Functions at http://localhost:8888
```

## Verification

```bash
npm run test:health
npm run typecheck:functions
npm run build
npx tsc --noEmit -p convex/tsconfig.json
git diff --check
```

The build emits a known Vite chunk-size warning; that is not a failure.

## Deployment

```bash
npx convex dev --once   # push schema + functions to the LIVE store dusty-ox-307
git push origin main    # auto-deploys Netlify (npm run build) from main
```

`npx convex deploy` is the WRONG command here: it targets the project's prod
deployment `qualified-hound-245`, which the app does not read. The live backend
is `dusty-ox-307` — Convex's *dev* deployment (`CONVEX_DEPLOYMENT`) — so push to
it with `npx convex dev --once`; verify the target first with `npx convex
dashboard --no-open`. Deploy Convex before Netlify so the live store accepts new
fields before functions send them. Netlify auto-deploys on push to `main`;
`netlify deploy --prod --skip-functions-cache` is the manual fallback. Redeploy
after changing env vars so functions receive them. After any deploy touching
functions, confirm deploy metadata includes `function_schedules` for
`scheduled-sync` — TypeScript passing does not prove Netlify detected the cron.

## Repository Map

```text
convex/            schema + queries/mutations (dailySnapshots, duneMetadata, graduatedTokens, syncRuns)
netlify/functions/ graduated, available-dates, health, scheduled-sync, backfill, _shared/
src/               App.tsx, components/, lib/ (types, theme, format)
.github/workflows/ health-monitor.yml
```

## Safe Production Checks

Read-only:

```bash
curl "https://metratrackerapp.netlify.app/api/health"
curl "https://metratrackerapp.netlify.app/api/available-dates"
curl "https://metratrackerapp.netlify.app/api/graduated?mode=historical&date=YYYY-MM-DD"
```

`mode=check-freshness` calls Dune's low-volume metadata path with the production
key — treat it as a bounded live-provider check:

```bash
curl "https://metratrackerapp.netlify.app/api/graduated?mode=check-freshness"
```

Admin-only live fetch (can trigger Dune result retrieval):

```bash
curl -H "x-admin-refresh-token: $ADMIN_REFRESH_TOKEN" \
  "https://metratrackerapp.netlify.app/api/graduated?mode=live&force=true"
```

## Convex Tables

- `duneMetadata` — Dune cache metadata.
- `dailySnapshots` — one row per UTC snapshot date.
- `syncRuns` — durable scheduled-sync/backfill audit log; the operational health source.
- `graduatedTokens` — token rows linked to snapshot dates.
- `observedPeaks` — permanent per-mint peak cache used across every date.
- `providerUsage` — atomic monthly external-provider request reservations.

A single successful snapshot does not prove every 2-hourly run succeeded; check `syncRuns`.
Successful sync audit rows include the Solana Tracker budget period, used,
limit, and remaining request counts.

## Dune Credit Notes

Scheduled-sync credit usage is small even at the 2-hourly cadence. Free tier =
2,500 credits/month, billed at 1 credit per 1,000 datapoints (rows × columns).
Query `4124453` returns ~47 rows × 5 cols ≈ 235 datapoints ≈ ~0.24 credits per
read; `GET /results` reads the cached execution (no re-execution). At every-2h
that is ~360 reads/month ≈ ~14% of the monthly credits (hourly would be ~29%).
The `limit=0` freshness check is ~0 datapoints. Executing the query yourself
(POST /execute, used by backfill) is the expensive path.

- Credit-sensitive: scheduled sync, authorized `force=true`, real backfills, query growth (more rows/columns).
- Low/no usage: historical browsing, `/api/available-dates`, `/api/health`, backfill `dryRun=true`.
- `mode=check-freshness` uses Dune's low-volume metadata path but still counts as a live-provider check.

## Important Operational Notes

- Historical missing data predates durable sync audit records; it was not caused by the Convex deployment mismatch.
- The Convex mismatch still matters: deployers can push functions to one Convex deployment while Netlify reads another.
- Backfill repair exists, but always start with `dryRun=true`.
- The Dune key is fragile: a real-looking key was once committed and the account was reported banned. Do not rotate or revoke the production key until a tested replacement exists.
- Keep `ADMIN_REFRESH_TOKEN` server-only; never expose it to the browser.
- DexScreener `pairCreatedAt` is pair-creation metadata. Do not use it as the date-tab grouping key for this rolling-snapshot app.
