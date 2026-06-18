# meta.tracker

Dashboard for tracking newly graduated Solana tokens from Dune, enriched with DexScreener market data and social links. The app is a React/Vite frontend with Netlify Functions for API/runtime work and Convex for durable snapshots, sync audit records, and historical browsing.

## Production

- Site: `https://metratrackerapp.netlify.app`
- GitHub repo: `https://github.com/kigensystems/metatracker`
- Live Convex URL currently configured in Netlify: `https://dusty-ox-307.convex.cloud`
- Convex production deployment also exists: `qualified-hound-245`

Important: Netlify production currently uses `dusty-ox-307`, and that is where the live data is. Do not casually switch `CONVEX_URL` to `qualified-hound-245`; treat that as a deliberate data migration.

## Architecture

```text
Dune query results
  -> Netlify Functions
  -> Convex snapshots and sync audit tables
  -> React frontend

DexScreener enrichment is performed by Netlify Functions before snapshot writes.
```

The core production flow is:

1. Netlify scheduled function runs at `00:00` and `12:00` UTC.
2. It fetches Dune query `4124453`.
3. It enriches tokens through DexScreener in batches.
4. It writes token snapshots and sync metadata to Convex.
5. The frontend reads live/historical data through Netlify API endpoints.

Only scheduled syncs should write durable snapshots and update `duneMetadata`. Browser/manual refreshes may return live data, but they must not advance durable metadata unless they also store a matching snapshot.

## Data Sources

### Dune

Main query: `4124453`

This is a third-party public query owned by `adam_tehc`. It returns:

- `token_address`
- `asset`
- `market_cap`
- `trade_count`
- `vwap_token_price`

The current query is a rolling recent-window query. Historical repair uses a separate parameterized query.

The upstream query already filters for recently graduated tokens, meaningful trade activity, and real DEX trading volume. Recheck the query itself before changing product assumptions about token coverage.

Backfill query: `7746626`

That query accepts:

- `window_start`
- `window_end`

It returns the same token columns as the live query and is used by `POST /api/backfill`.

### DexScreener

Endpoint pattern:

```text
https://api.dexscreener.com/latest/dex/tokens/{mint}
```

Used for token name, image, market cap, website, X/Twitter, and pair creation timestamp.

## Cache And Snapshot Rules

The live API uses Dune metadata to decide whether Convex already has the latest scheduled snapshot.

Expected source values:

- `cache`: Convex snapshot matches the latest Dune execution metadata.
- `cache-stale`: Convex has stored data, but Dune metadata indicates newer source data exists.
- `live`: Dune data was fetched directly for this request and returned without advancing durable Convex metadata.
- `historical`: Convex snapshot for a requested historical date.

Only scheduled syncs and admin backfills should write durable snapshots. Live/manual requests may return live data, but they must not update `duneMetadata` unless a matching snapshot is also stored.

## Scheduled Sync

Schedule: `0 0,12 * * *` in UTC.

The scheduled Netlify background function:

1. Creates a best-effort `syncRuns` start record for the expected cron slot.
2. Fetches the Dune query result with bounded automatic retries.
3. Enriches tokens through DexScreener in batches.
4. Validates that the result is complete enough to replace existing data.
5. Stores the Convex daily snapshot and token rows.
6. Updates `duneMetadata`.
7. Patches the `syncRuns` row with success or failure details.

Daily snapshots are one row per UTC date. A date can have data even if one of the two daily cron slots failed, so operational health should come from `syncRuns` and `/api/health`, not from snapshot presence alone.

## Frontend Behavior

- Header shows logo, last updated timestamp, next scheduled sync countdown, token count, and refresh.
- Date picker shows Today plus recent snapshot dates.
- Token table supports market-cap sorting, 50-row pagination, DexScreener row links, and website/X links when available.
- Historical date tabs filter out empty snapshots.
- Manual browser refresh only bypasses the client cache. It does not send `force=true`.

## Runtime Endpoints

All production API routes are exposed through Netlify redirects under `/api/*`.

### `GET /api/graduated`

Main data endpoint.

Parameters:

| Param | Values | Notes |
| --- | --- | --- |
| `mode` | `live`, `historical`, `check-freshness` | Defaults to `live`. |
| `date` | `YYYY-MM-DD` | Required for `historical`. |
| `force` | `true` | Admin-only. Requires `x-admin-refresh-token`. |

Unauthenticated `force=true` must return `403`.

### `GET /api/available-dates`

Returns recent Convex snapshot dates and token counts for the date picker.

### `GET /api/health`

Read-only production health endpoint. It checks Convex sync audit data and daily snapshots. It does not call Dune.

Healthy response:

```json
{
  "ok": true,
  "latestRun": { "status": "success" },
  "missingDueSlots": []
}
```

It returns `503` when an expected `00:00` or `12:00` UTC sync slot is past the 30-minute grace window without a successful `syncRuns` record.

### `POST /api/backfill`

Admin-only historical repair endpoint. Requires `x-admin-refresh-token` matching `ADMIN_REFRESH_TOKEN`.

Useful dry run:

```bash
curl -X POST \
  -H "x-admin-refresh-token: $ADMIN_REFRESH_TOKEN" \
  "https://metratrackerapp.netlify.app/api/backfill?date=YYYY-MM-DD&dryRun=true"
```

Default behavior is idempotent. If the date already has a non-empty snapshot, the endpoint returns `skipped: true` / `wouldSkipExisting: true` unless `replaceExisting=true` is explicitly provided.

Do not run a real backfill casually. It executes Dune and can replace data when `replaceExisting=true`.

## Monitoring And Alerts

Health monitor workflow:

```text
.github/workflows/health-monitor.yml
```

It runs every 10 minutes and checks:

```text
https://metratrackerapp.netlify.app/api/health
```

Alert behavior:

- On failure, it opens or comments on one GitHub issue titled `meta.tracker scheduled sync health failing`.
- On recovery, it closes that issue.
- It also fails the GitHub Actions run.

This is a GitHub-native notification path. It is not Slack, Discord, SMS, PagerDuty, or direct email unless repo watchers have GitHub notifications configured.

If stronger notifications are needed, wire the same `/api/health` endpoint into an uptime tool or add a Slack/Discord webhook step to the workflow.

When an alert opens:

1. Open `/api/health`.
2. Check `missingDueSlots`, `latestRun`, and `latestSnapshot`.
3. Check Netlify function logs for `scheduled-sync`.
4. If a date or slot is missing and Dune access is working, start with a `dryRun=true` backfill check.
5. Do not run `replaceExisting=true` until you have confirmed the existing snapshot is missing or bad.

## Environment Variables

Production Netlify variables:

```text
DUNE_API_KEY
CONVEX_URL
CONVEX_DEPLOYMENT
ADMIN_REFRESH_TOKEN
DUNE_BACKFILL_QUERY_ID=7746626
```

Do not print or commit real values. `.env.example` contains placeholders only.

## Development

Install dependencies:

```bash
npm install
```

Run Convex locally:

```bash
npx convex dev
```

Run Netlify/Vite dev server:

```bash
npx netlify dev
```

Open:

```text
http://localhost:8888
```

## Verification

Use the narrowest relevant checks for small changes. For the full reliability surface:

```bash
npm run test:health
npm run typecheck:functions
npm run build
npx tsc --noEmit -p convex/tsconfig.json
git diff --check
```

The build currently emits a Vite chunk-size warning; that is known and not a build failure.

## Deployment

Convex:

```bash
npx convex deploy
```

Netlify:

```bash
netlify deploy --prod --skip-functions-cache
```

If Netlify env vars changed, redeploy Netlify so functions receive the new values.

Because the current live backend is `dusty-ox-307`, verify the Convex deploy target before assuming production was updated.

## Repository Map

```text
convex/
  schema.ts                 Convex tables
  dailySnapshots.ts         Snapshot date queries and cleanup
  duneMetadata.ts           Dune cache metadata queries/mutations
  graduatedTokens.ts        Token snapshot storage and reads
  syncRuns.ts               Scheduled sync/backfill audit log

netlify/functions/
  graduated.ts              Main data API
  available-dates.ts        Stored date list API
  health.ts                 Convex-backed health endpoint
  scheduled-sync.ts         00:00/12:00 UTC scheduled sync
  backfill.ts               Admin historical repair endpoint
  _shared/                  Shared retry, sync-health, and Dune/enrichment helpers

src/
  App.tsx                   Main frontend state and fetch flow
  components/               Header, date picker, token table, rows, loading/empty states
  lib/                      Types and theme

.github/workflows/
  health-monitor.yml        External health monitor and GitHub issue alerting
```

## Safe Production Checks

Read-only checks:

```bash
curl "https://metratrackerapp.netlify.app/api/health"
curl "https://metratrackerapp.netlify.app/api/available-dates"
curl "https://metratrackerapp.netlify.app/api/graduated?mode=historical&date=YYYY-MM-DD"
```

Bounded provider check:

```bash
curl "https://metratrackerapp.netlify.app/api/graduated?mode=check-freshness"
```

`mode=check-freshness` calls Dune metadata with the production key. Treat it as a bounded live-provider check, not a purely local health check.

Admin-only live fetch:

```bash
curl \
  -H "x-admin-refresh-token: $ADMIN_REFRESH_TOKEN" \
  "https://metratrackerapp.netlify.app/api/graduated?mode=live&force=true"
```

Use caution: this can trigger Dune result retrieval.

## Convex Tables

- `duneMetadata`: Dune cache metadata.
- `dailySnapshots`: one row per UTC snapshot date.
- `syncRuns`: durable scheduled-sync/backfill audit log.
- `graduatedTokens`: token rows linked to snapshot dates.

`syncRuns` is the operational health source. A single successful daily snapshot does not prove both daily cron slots ran.

## Dune Credit Notes

Normal scheduled sync credit usage is expected to be small for the current query shape. On June 17, 2026, the production live response was about `6.3 KB`; at Dune's documented Free export rate of 20 credits per MB, this is roughly `0.12` credits per full result export.

Credit-sensitive operations:

- scheduled sync
- authorized `force=true`
- real backfill executions
- query growth that returns many more rows or columns

Low/no Dune usage operations:

- historical browsing
- `/api/available-dates`
- `/api/health`
- backfill `dryRun=true`

`mode=check-freshness` calls Dune's low-volume metadata path and should still be treated as a live-provider check.

## Important Operational Notes

- Historical missing data was not caused by the Convex deployment mismatch. It happened before durable sync audit records existed.
- The Convex mismatch is still important because deployers can push functions to one Convex deployment while Netlify reads another.
- Backfill repair is now possible, but should start with `dryRun=true`.
- The Dune account/key remains fragile because the project history included a real-looking exposed key and the Dune account was reported banned. Do not rotate or revoke the production key until a tested replacement exists.
- Keep `ADMIN_REFRESH_TOKEN` server-only. Never expose it to the browser.
