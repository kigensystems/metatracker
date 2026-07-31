# meta.tracker

Dashboard for tracking newly graduated Solana tokens from pump.fun, enriched
with DexScreener market data. React/Vite frontend, Netlify Functions for
API/runtime work, and Convex for durable snapshots, sync audit, and historical
browsing.

Canonical agent instructions: [AGENTS.md](AGENTS.md). Claude compatibility:
[CLAUDE.md](CLAUDE.md). Forward plan: [PLAN.md](PLAN.md). Known unknowns and
deferred cleanups: [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md). Incident history +
changelog: [docs/HISTORY.md](docs/HISTORY.md).

## Production

- Site: `https://metratrackerapp.netlify.app`
- Repo: `https://github.com/kigensystems/metatracker`
- Live Convex (configured in Netlify): `dusty-ox-307.convex.cloud`
- A second Convex deployment exists: `qualified-hound-245`

Netlify production reads `dusty-ox-307`, where the live data is. The push
procedure and the deploy-target footgun are under [Deployment](#deployment).

## Architecture

```text
pump.fun graduated feed
  -> Netlify Functions
  -> Convex daily observed-token unions and sync audit tables
  -> React frontend

DexScreener enrichment runs in Netlify Functions before snapshot writes; the
reported ATH arrives with discovery and is written to `observedPeaks`.
```

Core production flow:

> **Deployed and verified in production 2026-07-31.** The first run captured
> 809 graduates with 100% DexScreener enrichment; the dashboard went from 23
> tokens to 818. One thing is still unproven — pump.fun has never been fetched
> successfully from a Netlify IP, only from a residential one. Evidence is in
> [docs/HISTORY.md](docs/HISTORY.md); what remains is in [PLAN.md](PLAN.md).

1. Netlify scheduled function runs every 2 hours (00:00, 02:00, … 22:00 UTC).
2. Pages the pump.fun graduated feed back 24 hours.
3. Enriches tokens through DexScreener, paced under its throttle ceiling.
4. Records each reported ATH into `observedPeaks`, in batches of 10.
5. Merges the result into that UTC date's observed-token union in Convex.
6. Writes source metadata and sync audit data.
7. Frontend reads stored snapshots through Netlify `/api/*` endpoints.

Capture happens only in `scheduled-sync`, which is a background function
precisely because a full cohort needs minutes of paced enrichment. `/api/*` is
read-only: it calls no data source and holds no API key. Only scheduled syncs
and admin backfills write durable snapshots.

## Data Sources

### pump.fun

`https://frontend-api-v3.pump.fun/coins?complete=true&sort=created_timestamp&order=DESC&limit=50&offset=N&includeNsfw=true`
— the graduated feed, paged back 24 hours at one page per second. Supplies
discovery, `image_uri` (100% coverage), `website`/`twitter`/`telegram`, live
`usd_market_cap`, and `ath_market_cap` + `ath_market_cap_timestamp`.

Undocumented and moving: v1 and v2 are already retired and ~95% of the
community-documented endpoints now 404. Probe before believing any endpoint,
and keep the DexScreener fallback so a failure degrades instead of breaking. An
empty feed is treated as a source failure and the sync refuses to store it,
leaving the previous snapshot intact.

The ATH is recorded **unfiltered**. pump.fun reports wash-printed peaks
faithfully, and no reliable way to identify them at capture time has been
found — read the fake-ATH record in [docs/HISTORY.md](docs/HISTORY.md) before
attempting a filter.

### Dune (retired from the sync path)

Main query `4124453` — a third-party public query owned by `adam_tehc`, which
missed ~95% of graduations. No longer read by `scheduled-sync`. Backfill query
`7746626` accepts `window_start`/`window_end` and is still used by
`POST /api/backfill`, the last remaining Dune consumer.

### DexScreener

`https://api.dexscreener.com/latest/dex/tokens/{mint}` — token name, image,
banner (`info.header`, ~72% coverage), market cap, volume, liquidity, 24h price
change, website, X/Twitter, and pair creation timestamp.

### Solana Tracker (superseded)

pump.fun reports an all-time high with the token itself, so `peak-backfill.ts`
is redundant for anything captured by the new sync. It still runs, and still
owns the peaks for every row captured before the migration. The chart endpoint
supplies observed peak market cap. `netlify/functions/peak-backfill.ts`
runs hourly and reads each mint exactly once, while it is between **24 hours and
5 days old**. The lower bound waits for Dune's 24-hour window to close so the
run is over and the reading is a completed observation rather than a running
maximum. The upper bound is a product decision: this meta moves fast and
attention moves on, so an older token is not worth a request.

That bound also keeps usage permanently inside the free plan. The stored history
reaches back to 2026-03 (~7.2k mints); reading all of it would cost roughly 3x
the monthly free allowance to answer questions about tokens nobody is
researching. The 5-day window is ~60 mints, and steady state equals the arrival
rate (~15-45/day).

The request uses `type=1h` with `marketCap=true` and `removeOutliers=false`.
Two provider behaviours, verified against the live API on 2026-07-27, drive
that choice:

- A response is capped at 2000 candles and returns the **most recent** ones.
  `time_from` cannot extend coverage backwards, so at `1m` any token with more
  than 2000 traded minutes silently loses the early history where peaks occur.
  At `1h` a token's whole life fits inside the cap (~83 days), and an hourly
  candle's `high` is the max of its minute highs, so brief wicks survive.
- The raw HTTP parameters are `time_from`/`time_to`. Sending `timeFrom`/`timeTo`
  is silently ignored and returns the provider's default window.

No budget accounting is needed. The free plan's 3 req/s is enforced by 1-second
spacing. A provider-wide refusal (401/402/403/429) raises a distinct halt error
that ends the run **without writing rows**, so pending mints keep their retry
budget instead of an exhausted quota marking thousands of them permanently
failed. Readings are flushed to Convex in batches of 10, so a timeout or crash
never discards work already paid for.

Peaks live only in `observedPeaks`, keyed by mint, and are joined onto tokens at
read time in `/api/graduated`. Stored snapshots are never rewritten to carry a
peak, and a token shows the same peak on every date it appeared.

This metric is labeled **observed peak market cap**, not ATH, *for readings
derived from candle history*: those are bounded by the window actually examined,
which each row records. Rows sourced from pump.fun carry
`observedPeakCandleInterval: "reported"` and a genuine all-time high, so the
drawer labels those `ATH market cap`. The table column stays `Observed peak`
because it mixes both kinds of row.

## Cache and Snapshot Rules

`/api/graduated` serves stored snapshots only. `source` values:

- `snapshot` — the most recent stored snapshot, which is not necessarily today's.
  Between UTC midnight and the first sync of the day there is no row for today,
  and yesterday's cohort is a better answer than an empty table.
- `historical` — Convex snapshot for a requested historical date.

`isStale` is set when that snapshot was captured longer ago than the health
endpoint's sync tolerance (~4.5h). Older payloads used `cache`, `cache-stale`
and `live`; the frontend parser still reads them so historical fixtures stay
valid.

## Scheduled Sync

Schedule: `0 */2 * * *` (UTC) — every 2 hours. The scheduled Netlify background function:

1. Records a best-effort `syncRuns` start row for the expected cron slot.
2. Pages the pump.fun graduated feed back 24 hours, with bounded retries.
3. Enriches tokens through DexScreener at 5 requests in flight per second.
4. Stores the snapshot, using the capture time as the source timestamp —
   pump.fun has no execution stamp, and capture time only moves forward, which
   is what the store's not-older guard checks.
5. Records each reported ATH into `observedPeaks` in batches of 10. A failure
   here is logged but does not fail the run: the cohort is captured either way.
6. Patches the `syncRuns` row with both incoming and retained token counts, plus
   the newest creation time the feed offered as its freshness reading.

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

- Header: text wordmark, freshness dot, and live countdowns to the next sync
  (`0 */2 * * *`) and peak read (`20 * * * *`) via `NextRuns`. No logo.
- Summary cards (`MetaSummary`): **Cleared $100K · Highest peak · Most active ·
  Biggest 24h move**; token-backed cards open that token's drawer.
- `ControlBar`: snapshot date tabs (latest + recent UTC observation dates) and
  the **Cleared $100K** filter toggle in one row.
- Token table: sortable by **Age, 24h vol (default), Observed peak, Market cap,
  and 24h % change**; 56px art, mint tag to disambiguate repeated tickers,
  sticky header, 50-row pagination. Plain-text links (`Website · DexScreener ·
  X`) under each name — deliberately not icons or chip buttons. Row → detail
  drawer.
- Peak column shows the peak, or `—` when the source reported none
  (`src/lib/peak.ts`). There is no longer a "pending" state: the ATH arrives
  with discovery.
- Empty historical snapshots are filtered out.
- Manual browser refresh only bypasses the client cache; there is no live-fetch
  path to trigger.

## Runtime Endpoints

All routes are exposed through Netlify redirects under `/api/*`.

### `GET /api/graduated`

| Param | Values | Notes |
| --- | --- | --- |
| `mode` | `live`, `historical` | Defaults to `live` (latest stored snapshot). |
| `date` | `YYYY-MM-DD` | Required for `historical`. |

Optional token fields such as `graduatedAt`, `observedPeakMarketCap`,
`observedPeakAt`, `measuredVolumeUsd`, `buyCount`, `sellCount`, and
`sourceExecutionEndedAt` pass through additively. They are omitted for
snapshots that never had them, so the API contract stays valid across both
pipelines.

### `GET /api/available-dates`

Recent Convex snapshot dates + token counts for the date picker (rolling
snapshots for legacy dates and retained observed-token unions for new dates).

### `GET /api/health`

Read-only health endpoint backed by Convex sync audit data and daily snapshots;
it calls no data source. Health requires both a successful app sync within ~4.5h
(two 2h intervals + grace) and source data no older than ~6.5h. The second tier
is what catches a feed that keeps answering with a frozen page while every sync
around it reports success. Healthy:

```json
{ "ok": true, "latestSuccess": { "status": "success" }, "syncAgeMinutes": 12, "staleAfterMinutes": 270, "feedAgeMinutes": 85, "feedStaleAfterMinutes": 390 }
```

Returns `503` when no recent successful `syncRuns` record exists, or when that
run recorded a missing, malformed, or stale source freshness timestamp.

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
3. If a slot is missing, start with a `dryRun=true` backfill check (Dune-backed).
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

Every `/api/graduated` and `/api/health` read is a Convex read: none of them
reaches a data provider, so they are all safe to run against production.

## Convex Tables

- `duneMetadata` — Dune cache metadata. Written by nothing since the migration;
  kept until the schema prune (see [PLAN.md](PLAN.md)).
- `dailySnapshots` — one row per UTC snapshot date.
- `syncRuns` — durable scheduled-sync/backfill audit log; the operational health source.
- `graduatedTokens` — token rows linked to snapshot dates. These never carry a peak.
- `observedPeaks` — one completed peak reading per mint, with the window it
  covered and a `status` of `ok`, `empty`, or `failed`.

A single successful snapshot does not prove every 2-hourly run succeeded; check `syncRuns`.

## Dune Credit Notes

The scheduled sync no longer touches Dune, so routine operation costs zero
credits. Free tier = 2,500 credits/month, billed at 1 credit per 1,000
datapoints (rows × columns).

- Credit-sensitive: real backfills only. `POST /execute` is the expensive path
  and `POST /api/backfill` is its only caller.
- No usage: the dashboard, historical browsing, `/api/available-dates`,
  `/api/health`, and backfill `dryRun=true`.

## Important Operational Notes

Operational guardrails — the fragile Dune key, the Convex deploy target, the
DexScreener throttle, admin-only endpoints, and date-tab semantics — live in
[AGENTS.md](AGENTS.md)'s Guardrails section. That copy is authoritative; this
file does not restate them.

Two facts unique to this file:

- Historical missing data predates durable sync audit records; it was not caused by the Convex deployment mismatch.
- Keep `ADMIN_REFRESH_TOKEN` server-only; never expose it to the browser.
