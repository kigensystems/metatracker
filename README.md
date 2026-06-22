# meta.tracker

Dashboard for tracking newly graduated Solana tokens from Dune, enriched with
DexScreener market data and social links. React/Vite frontend, Netlify Functions
for API/runtime work, and Convex for durable snapshots, sync audit, and
historical browsing.

Contributor quick-reference: [CLAUDE.md](CLAUDE.md). Forward plan:
[PLAN.md](PLAN.md). Incident history + changelog: [docs/HISTORY.md](docs/HISTORY.md).

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
  -> Convex snapshots and sync audit tables
  -> React frontend

DexScreener enrichment runs in Netlify Functions before snapshot writes.
```

Core production flow:

1. Netlify scheduled function runs every 2 hours (00:00, 02:00, … 22:00 UTC).
2. Fetches Dune query `4124453`.
3. Enriches tokens through DexScreener in batches.
4. Writes token snapshots and sync metadata to Convex.
5. Frontend reads live/historical data through Netlify `/api/*` endpoints.

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
4. Validates the result is complete enough to replace existing data.
5. Stores the Convex daily snapshot and token rows.
6. Updates `duneMetadata`.
7. Patches the `syncRuns` row with success/failure detail.

Daily snapshots are one row per UTC date, overwritten by each 2-hourly run, so a
date can have data even if some runs failed — operational health should come from
`syncRuns` and `/api/health`, not snapshot presence. Because the live Dune query
is rolling-window (not calendar-day), snapshot dates mark when the rolling result
was stored; user-facing history tabs describe rolling snapshot windows, not
token-created calendar days.

## Frontend Behavior

- Header: logo, last-updated, next-sync countdown (every 2h), refresh.
- "Current meta" summary strip: top volume, top gainer, top market cap, total
  24h volume (each token card opens that token's drawer).
- Date picker: latest rolling 24h plus recent rolling snapshot windows.
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

### `GET /api/available-dates`

Recent Convex snapshot dates + token counts for the date picker (rolling
snapshot windows, not calendar-day buckets).

### `GET /api/health`

Read-only health endpoint backed by Convex sync audit data and daily snapshots;
does not call Dune. Health is recency-based: OK when a sync succeeded within
~4.5h (two 2h intervals + a 30-minute grace). Healthy:

```json
{ "ok": true, "latestSuccess": { "status": "success" }, "syncAgeMinutes": 12, "staleAfterMinutes": 270 }
```

Returns `503` when no successful `syncRuns` record exists within the stale window
(`syncAgeMinutes` > `staleAfterMinutes`, or no success at all).

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

`.github/workflows/health-monitor.yml` runs every 10 minutes and checks
`https://metratrackerapp.netlify.app/api/health`. On failure it opens or
comments on one GitHub issue (`meta.tracker scheduled sync health failing`) and
fails the Actions run; on recovery it closes the issue. This is GitHub-native
notification only (no Slack/Discord/SMS/PagerDuty unless wired up).

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
npx convex deploy
netlify deploy --prod --skip-functions-cache
```

Redeploy Netlify after changing env vars so functions receive them. Because the
live backend is `dusty-ox-307`, verify the Convex deploy target before assuming
production updated. After any deploy touching functions, confirm deploy metadata
includes `function_schedules` for `scheduled-sync` — TypeScript passing does not
prove Netlify detected the cron.

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

A single successful snapshot does not prove every 2-hourly run succeeded; check `syncRuns`.

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
