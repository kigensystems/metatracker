# meta.tracker — History

Archived incident logs, rollout records, and changelog. Newest first. For the
current forward plan see [PLAN.md](../PLAN.md); for stable architecture and
operations docs see [README.md](../README.md).

---

## 2026-06-23 — Redesign deployed to production; creation time in list rows

Deployed the 2026-06-22 volume-first redesign to production, fixed a Convex
deploy footgun, and shipped a list follow-up.

- **Convex deploy footgun caught + fixed.** `npx convex deploy` targets the
  project's *prod* deployment `qualified-hound-245`, which the app does **not**
  read — Netlify's `CONVEX_URL` points at `dusty-ox-307` (Convex's *dev*
  deployment). A `convex deploy --dry-run` confirmed the wrong target before any
  push; the live store is updated with **`npx convex dev --once`** instead.
  README + CLAUDE.md were corrected (they previously said `convex deploy`).
- **Deploy sequence.** Convex first (`convex dev --once` → `dusty-ox-307`,
  additive optional `bannerImage`, no data migration), then Netlify via push to
  `main` (auto-deploy from the linked GitHub repo). Verified `function_schedules`
  cron `0 */2 * * *`, `/api/health` `ok:true`, and `bannerImage` populating
  (48/59 tokens after the first new-code sync).
- **Found (logged as a risk): `/api/scheduled-sync` is unauthenticated** — a
  public POST runs the full sync. Low impact (Dune reads ~free), to be gated.
- **Creation time in list rows.** Each row shows the absolute creation time next
  to age, reusing the drawer's `formatDateTime` (lifted into shared
  `src/lib/format.ts`). Rendered in the viewer's local zone with a label (e.g.
  `Jun 23, 10:15 PM PDT`); shown at `md`+ width so the longer string doesn't
  squeeze `$SYMBOL` out of the row.
- `deno.lock` synced with `package.json` to match the redesign's dependencies.

---

## 2026-06-22 — Volume-first redesign, 2h sync, recency-based health

Goal: make the dashboard a fast personal "quick lookup" for the current
volume/meta. Working tree (not yet committed/deployed at time of writing):

- **UI**: added a "current meta" summary strip (top volume / top gainer / top
  market cap / total 24h volume) above a denser, **sortable** token table.
  24h volume + market cap + color-coded 24h % are now inline; default sort is
  volume. Liquidity / trades / VWAP stay in the detail drawer.
  (`MetaSummary.tsx`, `TokenList.tsx`, `TokenRow.tsx`, shared `src/lib/format.ts`
  + `src/components/icons.tsx`; `ROW_GRID` lives in `TokenRow.tsx`.)
- **Drawer**: shows the free DexScreener banner image at top; stats reordered
  volume-first. Descriptions were investigated and dropped — not available free
  per token (DexScreener token endpoint has none; its profiles feed had 0/47
  overlap with our tokens; pump.fun is Cloudflare-blocked). Banner
  (`info.header`, ~72% coverage) is the free "what is it" signal instead.
- **Data**: capture `bannerImage` (`header || openGraph`) end-to-end
  (`token-sync.ts` → `convex/schema.ts` + `graduatedTokens.ts` validator →
  `graduated.ts` → `types.ts` → drawer). Optional field; appears after the first
  post-deploy sync.
- **Freshness**: scheduled-sync moved 12h → **every 2h** (`0 */2 * * *`). Dune
  reads are ~0.24 credits each (free tier: 1 credit = 1,000 datapoints; query
  returns ~235), so ~360 reads/mo ≈ ~14% of the 2,500 monthly credits. That Dune
  query re-executes every ~1–3h, so reading more often captures fresher data
  without paying to execute.
- **Health**: replaced the per-slot audit with a **recency check** (OK if a sync
  succeeded within ~4.5h = 2 intervals + grace) in `sync-health.ts` / `health.ts`.
  Cadence-agnostic; no false alarms on the cadence change. `/api/health` now
  returns `syncAgeMinutes` / `staleAfterMinutes` / `latestSuccess` instead of
  `missingDueSlots`; the monitor workflow log was updated to match.
- **Verified**: `npm run build`, `typecheck:functions`, `tsc -p convex`,
  `test:health` (13/13), and a Chrome pass against production data (summary,
  sortable columns, drawer, banner layout, 2h countdown).
- **Deploy reminders**: after deploy, confirm `function_schedules` shows
  `cron: "0 */2 * * *"`. Two known follow-ups: `convex/syncRuns.ts` `bySlots` is
  now dead (needs `convex codegen` to remove); `backfill.ts` still uses a 0|12
  slot vocabulary + 12h/24h windows (works for daily reconstruction, but no
  longer mirrors the 2h cadence).

---

## 2026-06-22 — Token detail drawer + freshness UI shipped

- Merged the `codex/token-detail-freshness-ui` feature into `main`: token detail
  drawer (`src/components/TokenDetailDrawer.tsx`), data freshness bar
  (`src/components/FreshnessBar.tsx`), and clickable token rows.
- Fixed an accessibility/correctness bug from that branch: `TokenRow` was a
  `<button>` containing the social-link `IconButton`s (nested buttons → invalid
  HTML and a React hydration error). Reworked the row into a `role="button"` div
  with an Enter/Space key handler.
- Removed Telegram links the branch had re-added to the row and drawer,
  restoring the 2025-12-06 "website + X only" decision.
- Verified live via `netlify dev`: drawer, keyboard access, freshness states
  (cache-stale / historical), and a clean console. Frontend-only — no function
  or schedule impact.
- Docs reorganized: added `CLAUDE.md` (session quick-reference), moved this
  historical log out of `PLAN.md` into `docs/HISTORY.md`, removed dead type
  defs from `src/lib/types.ts`, deleted the boilerplate `convex/README.md`, and
  tightened `README.md`.

---

## Current Status - June 17, 2026

This section records the project review and production incident investigation performed on June 17, 2026.

### Production Deployment

- Netlify production site: `https://metratrackerapp.netlify.app`
- GitHub repo: `https://github.com/kigensystems/metatracker`
- Production deploy: commit `2d683006776d7a0699b22aa978c1baefe2ed6b68`, published December 8, 2025.
- Netlify has `scheduled-sync` registered on cron `0 0,12 * * *`.
- The production deploy has had the scheduled function present since launch; there was no later deploy that "turned on" scheduling.

### Site Review Notes

- The production frontend is deployed and its backend endpoints are responding.
- The normal UI exposes recent snapshot dates, so the historical data gap was not obvious from a quick visual review.
- Chrome plugin review against local `localhost` was limited by plugin network policy, so the production incident investigation used Netlify CLI, production API endpoints, and source review instead.

### Dependency And Security Maintenance

The project had 6 npm audit findings at the start of the review:

- 3 high severity
- 2 moderate severity
- 1 low severity

Resolved changes in the working tree:

- Upgraded Vite from 7.x to 8.0.16, removing the vulnerable Vite/Rollup/Picomatch/PostCSS path.
- Upgraded direct dependencies including Convex, React, Tailwind, Netlify Functions, Framer Motion, and lucide-react.
- Added an npm override for `ws@8.21.0` because current Convex pins vulnerable `ws@8.20.1`.
- Replaced a real-looking Dune API key in `.env.example` with `DUNE_API_KEY=your_dune_api_key`.
- Fixed CSS import ordering in `src/index.css`.

Verification after these changes:

- `npm audit --json` reports 0 vulnerabilities.
- `npm run build` passes on Vite 8.0.16.
- `git diff --check` passes.

Remaining intentionally deferred major-version updates:

- MUI 7 -> 9
- `@vitejs/plugin-react` 5 -> 6
- TypeScript 5 -> 6

These are not required for the current security audit and should be handled as separate migration work.

### Data Coverage Incident

Historical snapshot coverage was checked from December 5, 2025 through June 17, 2026 using the production historical API endpoint.

Summary:

```text
195 days checked
86 days with non-empty snapshots
1 day with an empty snapshot
108 days with no daily snapshot record
```

Non-empty snapshot ranges:

```text
2025-12-05..2025-12-06
2025-12-08..2025-12-17
2026-03-05
2026-03-10
2026-03-22..2026-03-24
2026-03-26..2026-03-27
2026-03-30
2026-04-01..2026-04-03
2026-04-07
2026-04-09
2026-04-11
2026-04-13..2026-04-29
2026-05-02..2026-05-10
2026-05-12..2026-05-14
2026-05-18..2026-06-17
```

Missing snapshot ranges:

```text
2025-12-07
2025-12-18..2026-01-09
2026-01-11..2026-03-04
2026-03-06..2026-03-09
2026-03-11..2026-03-21
2026-03-25
2026-03-28..2026-03-29
2026-03-31
2026-04-04..2026-04-06
2026-04-08
2026-04-10
2026-04-12
2026-04-30..2026-05-01
2026-05-11
2026-05-15..2026-05-17
```

The only stored empty snapshot found was `2026-01-10`.

Monthly coverage:

| Month | Days Checked | Non-empty Snapshots | Empty Snapshots | Missing Snapshot Records |
|-------|--------------|---------------------|-----------------|--------------------------|
| 2025-12 | 27 | 12 | 0 | 15 |
| 2026-01 | 31 | 0 | 1 | 30 |
| 2026-02 | 28 | 0 | 0 | 28 |
| 2026-03 | 31 | 8 | 0 | 23 |
| 2026-04 | 30 | 23 | 0 | 7 |
| 2026-05 | 31 | 26 | 0 | 5 |
| 2026-06 | 17 | 17 | 0 | 0 |

Interpretation:

- The backend is working now.
- It did not continuously store snapshots for the entire six-month gap.
- Because `storeSnapshot` writes a `dailySnapshots` record even for zero-token runs, days with no snapshot record likely mean the scheduled function did not run or failed before the Convex write.
- Old Netlify logs for January and early March were not available, so the exact historical failure mode cannot be proven from retained logs.
- The code did not change during the gap; the most likely causes are external platform/account/API state changes.

Confirmed recent runs:

```text
2026-06-17T00:10:16Z scheduled-sync
- Got 19 tokens from Dune
- Enriched 19 tokens, 100.0% success
- Stored in Convex

2026-06-17T12:08:12Z scheduled-sync
- Got 41 tokens from Dune
- Enriched 41 tokens, 100.0% success
- Stored in Convex
```

### Dune Account And API Key Findings

The Dune account created for this project reportedly shows as banned for Terms of Service violation. Production still successfully pulls Dune data.

Verified facts:

- Dune query endpoint without a key returns `401 invalid API Key`.
- Dune query endpoint with an invalid key returns `401 invalid API Key`.
- Production Netlify function successfully queried Dune on June 17, 2026.
- Therefore production is not relying on public unauthenticated access; the production `DUNE_API_KEY` is still accepted by Dune's API.
- Netlify audit events show `DUNE_API_KEY`, `CONVEX_DEPLOYMENT`, and `CONVEX_URL` were created when the production site was set up on December 6, 2025.
- The historical `.env.example` file contained a real-looking Dune key and was tracked in git. It has now been replaced with a placeholder in the working tree, but the key may still exist in git history and should be treated as compromised.

Likely ban triggers or risk factors:

- Publicly committed API key.
- Public `force=true` live endpoint can trigger Dune result pulls.
- No app-side rate limit or auth around manual refresh/force refresh.
- Dune docs state latest query-result retrieval does not trigger execution, but still consumes credits based on result size.
- Dune docs list `401` for invalid key, `402` for credit limit, `403` for permission problems, and `429` for rate limit.
- Dune Terms prohibit abuse or circumvention of credits, execution limits, rate limits, or plan restrictions. A leaked key plus automated traffic could be classified as abuse even if the original project usage was benign.

Open questions:

- Whether Dune banned only the web login/user while leaving an API key or team context active.
- Whether the production key belongs to a separate Dune user/team context.
- Whether third parties used the leaked key.
- Whether Dune enforcement was automated and false-positive.

API credit risk:

- Normal scheduled sync credit burn is not currently a material concern.
- Netlify observed `GET /api/graduated?mode=live` returning a `6.3 KB` JSON response on June 17, 2026.
- The app's raw Dune result is likely smaller than the enriched app response because the Dune fetch only reads `token_address`, `asset`, `market_cap`, `trade_count`, and `vwap_token_price`.
- At Dune's documented Free export rate of 20 credits per MB, a 6.3 KB response is roughly 0.12 credits. Even 60 scheduled pulls per month would be roughly 7-8 credits if charged at that size, far below the 2,500 monthly included credits.
- The old `~400 credits` per full fetch estimate should be treated as stale and likely far too high for the current query shape.
- Remaining credit risks are abuse of live/force refresh, unexpected query result growth, or production using a different Dune account/key context than the checked key.

Current operating decision:

- A replacement Dune API key is not currently available because the Dune account is banned.
- Keep the existing Netlify `DUNE_API_KEY` in place while it continues to work.
- Do not unset, overwrite, or revoke the current production key until a confirmed replacement key exists and has been tested in production.
- Treat the key as exposed and fragile. It may stop working without warning if Dune applies API enforcement to the banned account context.
- Focus immediate engineering work on reducing unnecessary Dune calls, blocking abuse paths, preserving stale data gracefully, and making failures visible.
- Appeal the Dune ban rather than creating replacement accounts to bypass enforcement.

### Known Product And Backend Risks

- Production currently has public `force=true` behavior that can cause production to call Dune. The current working tree changes browser refresh to avoid `force=true` and requires `ADMIN_REFRESH_TOKEN` for server-side force refresh.
- Production live cache misses update Dune metadata without storing a matching snapshot. This can make later cache checks believe Convex is fresh when stored token data is older than Dune metadata. The current working tree removes live metadata writes and treats scheduled sync as the owner of durable cache metadata.
- Daily snapshot coverage can hide partial scheduled-sync failure because the app runs two cron slots per day but stores one `dailySnapshots` row per UTC date.
- Live DexScreener enrichment now reuses the shared batched helper used by `scheduled-sync`, so live/manual fetches no longer fan out every DexScreener request at once.
- Client-side caching keeps a `live` result for the session with no TTL or freshness check.
- Netlify/Convex function code is not fully covered by the root `tsconfig`; `npm run build` mostly validates frontend code.
- No durable sync-failure records are stored in Convex. Once Netlify logs expire, historical root cause is hard to recover.
- Current UI only exposes recent dates, so long historical gaps can be hidden from normal visual review.

### Forward Plan

P0 - Credential containment and abuse protection:

- Keep the current Netlify `DUNE_API_KEY` unchanged until a replacement key is available.
- Do not expose the key in any repo, docs, logs, screenshots, or local example files.
- Disable unauthenticated `force=true`; allow it only for trusted admin calls with a server-side `ADMIN_REFRESH_TOKEN` header.
- Keep browser manual refresh as a client-cache bypass only. It must not send `force=true` or expose any admin token.
- Add server-side rate limiting for live/manual refresh.
- Add stale-data fallback behavior so the app keeps serving the last good Convex snapshot if Dune access fails.
- Keep `duneMetadata.lastExecutionEndedAt` tied to scheduled snapshot storage. Live/manual fetches may display live data but must not advance durable cache metadata unless a matching snapshot is stored.
- Add explicit alerts for `401`, `402`, `403`, and `429` responses from Dune.
- Coordinate git-history cleanup if the repo is public or may be cloned by others, but do not treat history cleanup as key rotation.
- Appeal the Dune ban and request clarification on whether the API key is expected to keep working.

P0 - Credential recovery when Dune access is restored:

- Create a new Dune API key under the correct account/team.
- Store the new key as a secret Netlify environment variable.
- Deploy and confirm production can query Dune with the new key.
- Revoke the old exposed key only after the replacement key is confirmed working.

P1 - Snapshot reliability and observability:

- Current working tree adds a Convex `syncRuns` table for scheduled run attempts after Convex config/client initialization succeeds.
- Current working tree tracks the expected cron slot (`00:00` or `12:00` UTC), start time, end time, status, Dune status code, token count, enrichment success rate, error message, and source execution timestamp.
- Current working tree writes a best-effort `syncRuns` start record before the Dune fetch, then patches it on success or failure.
- Use Netlify-side alerts for bootstrap failures that cannot be written to Convex, such as missing `CONVEX_URL`.
- Current working tree adds a health endpoint that reports recent expected scheduled slots, the latest run, and the latest daily snapshot without calling Dune.
- Add alerts if no successful scheduled run exists for the expected 00:00 UTC slot by 00:30 UTC or the expected 12:00 UTC slot by 12:30 UTC.
- Keep daily snapshots and sync-run audit records independent, so future outages are diagnosable after Netlify logs expire.

P1 - Dune data ownership:

- Fork or recreate the Dune query under a controlled account/team.
- Confirm the query schedule and execution owner.
- Use Dune's usage endpoint to monitor credits.
- Add column limiting where possible to reduce result export cost.
- Document Dune account/team context, key owner, and rotation procedure outside public docs.

P1 - Cache correctness follow-up:

- Keep live cache behavior explicit in API responses: `source: "cache"` is fresh against the latest Dune status, `source: "cache-stale"` is the last stored snapshot, and `source: "live"` is an uncached Dune fetch.
- Add visible UI treatment for stale cached data.
- Add a short TTL or freshness check to the frontend `live` client cache.

P2 - Runtime hardening:

- Keep live/manual Dune fetches on the same shared Dune parsing, result-completeness guard, token-link, and batched DexScreener enrichment path used by scheduled syncs.
- Add typecheck scripts for Netlify functions and Convex files.
- Add tests or script checks for the API token adapter, `storeSnapshot`, date filtering, and cache freshness logic.
- Add an admin-only endpoint or CLI script for historical coverage reports.
- Add token search and watchlist features only after reliability and credential work is complete.

### Paused Work Note - June 17, 2026

The current working tree contains uncommitted reliability hardening and observability work:

- Admin-only `force=true` behavior using `ADMIN_REFRESH_TOKEN`.
- Browser refresh changed to bypass only client cache, not force Dune fetches.
- Live/cache behavior changed to avoid advancing `duneMetadata` unless a scheduled snapshot is stored.
- Stale Convex snapshot fallback when Dune freshness checks or Dune key config fail.
- New Convex `syncRuns` table and scheduled-sync start/success/failure audit writes.
- New `/api/health` endpoint backed by Convex only, with no Dune call.
- Shared bounded retry helper for Dune, Convex writes, and DexScreener transient failures.
- Scheduled sync source metadata capture: execution ID, state, row counts, result size, HTTP status, and retry count.
- Snapshot write guards that reject empty, paginated, malformed, or sharply lower replacement data before deleting good rows.
- Admin-only `POST /api/backfill` endpoint for idempotent historical repair with explicit `window_start` / `window_end` Dune parameters.
- Dedicated Netlify function typecheck script: `npm run typecheck:functions`.
- Focused local health-slot tests via `npm run test:health`.

Local checks run before pausing:

```bash
npm run test:health
npm run typecheck:functions
npm run build
npx tsc --noEmit -p convex/tsconfig.json
git diff --check
```

These checks passed before production deploy.

### Production Rollout - June 18, 2026

Deploy and smoke-test results:

- Convex schema/functions were deployed to the Convex production deployment `qualified-hound-245`.
- Netlify production was still configured with `CONVEX_URL=https://dusty-ox-307.convex.cloud`, so the same Convex changes were also pushed to `dusty-ox-307`, which is the backend the live site currently uses.
- Netlify production deploy succeeded: `6a337f54e45349981179bedf`.
- Production URL: `https://metratrackerapp.netlify.app`.
- Manual scheduled-sync smoke test succeeded at `2026-06-18T05:15Z`: 36 tokens, 100% enrichment, Dune execution `01KVC5YNPQA8ZR9PNAB7W33XYS`, `retryCount: 0`.
- `GET https://metratrackerapp.netlify.app/api/health` returned `200` at `2026-06-18T05:17:28Z` with `ok: true`, latest slot `2026-06-18T00:00:00.000Z`, latest run `status: "success"`, and `missingDueSlots: []`.
- `GET /api/graduated?mode=live&force=true` without an admin header returned `403`, as expected.
- `GET /api/available-dates` returned `200`.
- `POST /api/backfill?date=2026-06-18&dryRun=true` without an admin header returns `403`, as expected. Backfill is deployed but intentionally unusable until `ADMIN_REFRESH_TOKEN` and `DUNE_BACKFILL_QUERY_ID` are configured.
- Follow-up operations on June 18, 2026:
  - Added GitHub Actions external health monitor in `.github/workflows/health-monitor.yml`.
  - Set `ADMIN_REFRESH_TOKEN` in Netlify production.
  - Created public Dune backfill query `7746626` after private-query creation hit Dune's private-query quota.
  - Set `DUNE_BACKFILL_QUERY_ID=7746626` in Netlify production.
  - Redeployed Netlify production with the new environment variables: `6a3391b4ef1cdd7676aa0069`.
  - Verified authorized `POST /api/backfill?date=2026-06-18&dryRun=true` returns `200` and `wouldSkipExisting: true` without executing Dune.
  - Verified the GitHub Actions health monitor run `27741544544` completed successfully. A false alert issue from the first workflow attempt was closed by the recovery step.
  - Follow-up incident: the reliability hardening changed the scheduled function config export to a trailing `as Config & { type: "background" }` assertion. TypeScript passed, but Netlify's static parser stopped detecting the cron schedule, leaving `function_schedules: []` on deploy metadata. The `2026-06-18T12:00:00Z` slot did not fire, `/api/health` returned `503`, and GitHub issue `#2` opened.
  - Fixed by changing the export to `export const config: Config & { type: "background" } = { ... }` in commit `d943393`. Verified the production deploy `6a342f6bb8a0ec6ad196fc0b` had `function_schedules: [{ name: "scheduled-sync", cron: "0 0,12 * * *" }]`.
  - Manually invoked `scheduled-sync` once after that fix to repair the missed `12:00 UTC` slot. It stored 33 tokens for `2026-06-18`, Dune execution `01KVDSJXCMV1GARM6AA272ZA91`, `retryCount: 0`, 100% enrichment. `/api/health` returned `200` afterward with `missingDueSlots: 0`.
  - Follow-up UX/data correction: commit `d26b2b6` grouped historical tabs by DexScreener `pairCreatedAt`, which made the June 18 tab show only 3 tokens. That was incorrect because `pairCreatedAt` is pair creation metadata, not the Dune graduated-token rolling window. Reverted that behavior in commit `e20ce7f`; date tabs are rolling snapshot windows again, and the live June 18 snapshot showed 33 tokens after deploy `6a3430dc952929650875ee74`.

Closeout verification reran the same passing checks after this handoff section was updated.

The previous ad hoc Netlify function typecheck gap is closed by `npm run typecheck:functions`, which includes a Netlify function `process.env` declaration and the scheduled background config. Typecheck alone is not enough for scheduled functions; after each Netlify deploy, verify `function_schedules` in deploy metadata includes `scheduled-sync`.

### Current Working Tree Cleanup - June 18, 2026

Pre-push refactor cleanup in the current working tree:

- `GET /api/graduated` now uses shared Dune metadata/full-result helpers and shared batched DexScreener enrichment instead of maintaining duplicate live provider code.
- Token explorer links are generated through one shared helper.
- Removed unused client-side provider modules under `src/lib/dune.ts` and `src/lib/dexscreener.ts`; provider calls remain server-side in Netlify functions.
- Removed unused CSS utilities and the no-longer-used `Press Start 2P` font import.
- Added focused local tests for Dune metadata status fetching and shared token-link generation.

### Next Session Handoff - Data Reliability

Finish the remaining rollout items before adding new product features:

1. Durable sync audit: deployed and validated in production via `/api/health`.
2. External health alert: configured through GitHub Actions `.github/workflows/health-monitor.yml`, which checks `https://metratrackerapp.netlify.app/api/health` every 10 minutes and opens/comments on one alert issue when unhealthy.
3. Automatic retries: deployed; production smoke run completed with `retryCount: 0`.
4. Backfillable Dune query: public Dune query `7746626` is configured with explicit `window_start` and `window_end` parameters.
5. Idempotent backfill path: deployed as admin-only `POST /api/backfill`; production env now has `ADMIN_REFRESH_TOKEN` and `DUNE_BACKFILL_QUERY_ID=7746626`.
6. Good-data preservation: deployed; scheduled-sync writes now go through Dune completeness checks and Convex snapshot replacement guards.
7. Source metadata: deployed and visible in `/api/health` on `latestRun` and `latestSnapshot`.

The main reliability gap is recoverability, not API credits. Monitoring tells us a gap exists; backfill is what prevents that gap from becoming permanent.

Current handoff notes:

- Last connector verification on `2026-06-19T17:59:01Z`: GitHub alert issue `#2` was closed as recovered, recovery run `27785855237` reported `/api/health` OK at `2026-06-18T20:00:54.233Z`, there were no open `meta.tracker scheduled sync health failing` issues, and issue `#3` did not exist. Direct live Netlify API/frontend checks were blocked from the local Codex environment by DNS and Chrome enterprise network policy, so treat this as monitor evidence rather than a direct production UI inspection.
- Latest important deploys: `6a342f6bb8a0ec6ad196fc0b` restored Netlify schedule registration; `6a3430dc952929650875ee74` restored history tabs to rolling snapshot windows.
- Do not group history tabs by DexScreener `pairCreatedAt`. It is useful row/profile metadata only.
- Date tabs represent rolling Dune snapshot windows, not exact token-created calendar days.
- For every Netlify deploy that touches functions, verify deploy metadata contains `function_schedules: [{ name: "scheduled-sync", cron: "0 0,12 * * *" }]`.

---

## Recent Changes

### Dec 7, 2025 (Session 2) - UX Cleanup & Performance

**Visual Refresh**
- Softened color palette: neon green (#39ff14) → muted green (#22c55e)
- Softened purple: (#aa55ff) → (#a78bfa)
- Removed pixel font from header, now uses Inter with lowercase "meta.tracker"
- Removed redundant "Today • 79" badge from header (info now in date picker only)

**Date Picker Redesign**
- Changed from floating pill chips to connected ButtonGroup tabs
- Cleaner, more professional appearance
- Limited to 7 historical dates (was 14)

**Loading State**
- Replaced complex skeleton cards with minimal spinner
- Single Loader2 icon + "Loading tokens..." text

**Performance**
- Added client-side caching: revisiting a date is now instant
- Cache persists for session, keyed by date
- Force refresh bypasses cache

**Pagination**
- Now shows 50 results per page (was all at once)
- Pagination controls top and bottom
- Row numbers reflect correct rank across pages
- Page resets to 1 on date change

**Code Quality**
- All main components now use MUI consistently
- Removed unused Tailwind component imports
- CSS reduced from 17KB to 13KB

---

### Dec 7, 2025 (Session 1) - MUI Integration & Snapshot Reliability

**MUI Component Library**
- Added Material-UI (`@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`)
- Created custom MUI theme (`src/lib/theme.ts`) matching existing neon/pixel art design
- Header now uses MUI: AppBar, Toolbar, Chip, Tooltip, IconButton, LinearProgress
- DatePicker now uses MUI Chips with icons
- Tooltips on header elements for better UX

**DatePicker Simplification**
- Removed "Yesterday" button (was causing timezone confusion)
- Now shows: "Today" + dated pills (Dec 6, Dec 5, etc.)
- Dates sorted newest-first by date field (not Convex creation time)

**Timezone Fix**
- Server now returns `snapshotDate` in live/cache API responses
- Frontend uses server's date to filter historical dates (not client calculation)
- Prevents duplicate pills when client/server UTC dates differ
- Example: User in PST after 4pm would see wrong dates without this fix

**Snapshot Storage Hardening**
- **Only scheduled sync creates snapshots** (00:00 and 12:00 UTC)
- Manual refreshes no longer store data in Convex (only update cache metadata)
- Prevents duplicate/overlapping snapshots from timezone edge cases
- Each day guaranteed to have exactly one snapshot

**Data Cleanup**
- Added `deleteByDate` mutation to `dailySnapshots.ts`
- Allows removing stale/duplicate snapshots and their tokens
- Used to clean up duplicate Dec 7 data during debugging

**File Structure Updates**
- Added `src/lib/theme.ts` - MUI theme configuration

---

### Dec 6, 2025 - UI Overhaul & Production Deploy

**Header Simplification**
- Removed cluttered stats (Tracking X/X, Dune data freshness, source badges)
- Now shows: date, token count, last updated, next sync countdown, refresh button
- Added real-time countdown to next scheduled sync (00:00 or 12:00 UTC)

**DatePicker Redesign**
- Replaced confusing Live/Historical toggle with horizontal date pills
- "Today" fetches live data, past dates fetch historical snapshots
- Limited to 14 most recent days
- Filters out empty snapshots (tokenCount = 0)
- Color-coded: green for today, purple for historical

**Social Links**
- Updated Twitter icon to X logo (official SVG)
- Removed Telegram links entirely (only website + X now)

**Bug Fixes**
- Fixed `createdAt` not persisting: added missing field to Convex `tokenValidator`
- Added `createdAt` field to `scheduled-sync.ts` enrichment

**Code Cleanup**
- Removed unused state variables (`duneExecutionEndedAt`, `dataSource`)
- Removed unused Header props
- Added `scrollbar-hide` utility class

**Deployment**
- Initialized git repo
- Pushed to github.com/kigensystems/metatracker
- Deployed to Netlify

**Data Recovery**
- Accidentally wiped Dec 5 data during testing
- Created custom Dune query (ID: 6308633) with 48-24 hour time window
- Restored 155 tokens for Dec 5 with full DexScreener enrichment

**Historical Data Protection**
- Added safeguard in `storeSnapshot` mutation to prevent overwriting past dates
- Only today's date can be updated; historical dates throw an error
- Protects against accidental data loss from manual commands

---

### Dec 5, 2025 - Rebrand & Initial Features
- Renamed from "pump.tracker" to "meta.tracker"
- Added pixel art logo (`public/logo.png`)
- Added "Press Start 2P" pixel font for branding
- Dark neutral background (#0a0a0c)
- Added `createdAt` field from DexScreener's `pairCreatedAt`
- Added enrichment tracking with success rate logging
- Force refresh button bypasses cache

---

## Future Improvements (June 2026 snapshot)

Archived from the original PLAN.md; current open items are tracked in [PLAN.md](../PLAN.md).

- [ ] Keep current Netlify `DUNE_API_KEY` in place until a tested replacement exists
- [x] Protect public `force=true` in the current working tree
- [x] Add durable Convex `syncRuns` observability in the current working tree
- [ ] Add scheduled-sync alerting for each expected cron slot
- [ ] Appeal Dune ban and confirm whether existing API key should keep working
- [x] Add stale-data fallback if Dune freshness checks or key config fail in the current working tree
- [x] Add bounded retries, safer snapshot writes, richer source metadata, and admin backfill path in the current working tree
- [ ] Rotate Dune credentials and revoke the exposed key after account/key recovery
- [ ] Fork or recreate the Dune query under a controlled account/team
- [x] Fix live metadata/cache mismatch in the current working tree
- [x] Batch live DexScreener enrichment
- [x] Add typecheck coverage for Netlify and Convex code
- [ ] Add token search by name/symbol
- [ ] Real-time updates via Helius WebSocket
- [ ] Token watchlist (saved to local storage)
