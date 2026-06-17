# meta.tracker - Graduated Token Monitor

## Project Overview

A dashboard to track graduated Solana tokens from a Dune Analytics query, enriched with market data and social links from DexScreener. Features smart caching via Convex database, historical browsing, and automated data sync.

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

### Known Product And Backend Risks

- `force=true` is public and can cause production to call Dune. This should be protected or removed.
- The live endpoint updates Dune metadata on live cache misses without storing a matching snapshot. This can make later cache checks believe Convex is fresh when stored token data is older than Dune metadata.
- Live DexScreener enrichment still fans out requests in parallel, unlike `scheduled-sync`, which batches by 15 with a delay.
- Client-side caching keeps a `live` result for the session with no TTL or freshness check.
- Netlify/Convex function code is not fully covered by the root `tsconfig`; `npm run build` mostly validates frontend code.
- No durable sync-failure records are stored in Convex. Once Netlify logs expire, historical root cause is hard to recover.
- Current UI only exposes recent dates, so long historical gaps can be hidden from normal visual review.

### Forward Plan

P0 - Credential and abuse protection:

- Rotate the Dune API key immediately.
- Revoke the old key after production is updated.
- Store the new key as a secret Netlify environment variable.
- Remove the historical key from git history if the repo is public or may be cloned by others.
- Disable, authenticate, or rate-limit `force=true`.
- Add server-side rate limiting for live/manual refresh.

P1 - Snapshot reliability and observability:

- Add a Convex `syncRuns` table for every scheduled run attempt.
- Record start time, end time, status, Dune status code, token count, enrichment success rate, error message, and source execution timestamp.
- Write a `syncRuns` failure record before returning any scheduled-sync error.
- Add a health endpoint that reports the latest successful scheduled run and latest daily snapshot.
- Add an alert if no successful snapshot exists by 00:30 UTC and 12:30 UTC.
- Keep daily snapshots and sync-run audit records independent, so future outages are diagnosable after Netlify logs expire.

P1 - Dune data ownership:

- Fork or recreate the Dune query under a controlled account/team.
- Confirm the query schedule and execution owner.
- Use Dune's usage endpoint to monitor credits.
- Add column limiting where possible to reduce result export cost.
- Document Dune account/team context, key owner, and rotation procedure outside public docs.

P1 - Cache correctness:

- Do not update `duneMetadata.lastExecutionEndedAt` unless the corresponding Convex snapshot was stored.
- Alternatively, compare cached daily snapshot `executionEndedAt` with Dune status before serving cache.
- Make live cache behavior explicit: live fetches can display fresh data, but only scheduled syncs create durable snapshots.
- Add a short TTL or freshness check to the frontend `live` client cache.

P2 - Runtime hardening:

- Reuse the scheduled-sync batching approach for live DexScreener enrichment.
- Add typecheck scripts for Netlify functions and Convex files.
- Add tests or script checks for `deserializeFromConvex`, `storeSnapshot`, date filtering, and cache freshness logic.
- Add an admin-only endpoint or CLI script for historical coverage reports.
- Add token search and watchlist features only after reliability and credential work is complete.

### Useful Production Checks

Read-only checks that do not trigger Dune full fetches:

```bash
curl "https://metratrackerapp.netlify.app/api/available-dates"
curl "https://metratrackerapp.netlify.app/api/graduated?mode=historical&date=YYYY-MM-DD"
curl "https://metratrackerapp.netlify.app/api/graduated?mode=check-freshness"
```

Use caution with:

```bash
curl "https://metratrackerapp.netlify.app/api/graduated?mode=live&force=true"
```

`force=true` can trigger Dune result retrieval and should be treated as a budgeted operation until protected.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Dune      │────▶│ Netlify Functions │────▶│   Convex    │
│  Analytics  │     │  (graduated.ts)   │     │  Database   │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │                        │
                            ▼                        │
                    ┌──────────────┐                 │
                    │ DexScreener  │                 │
                    │     API      │                 │
                    └──────────────┘                 │
                                                     │
┌─────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────┐
│                  React Frontend                      │
│  • Table view with sortable columns                 │
│  • Direct links to DexScreener                      │
│  • Social links (website, X)                        │
│  • Date pill selector (Today + last 14 days)        │
│  • Next sync countdown in header                    │
│  • Token creation time (PST)                        │
└─────────────────────────────────────────────────────┘
```

---

## Data Sources

### Dune Query (ID: 4124453)
**Owner**: Third-party public query (we fetch cached results only)

**What it provides**:
- `token_address` - Solana mint address
- `asset` - Token symbol
- `market_cap` - VWAP-based market cap
- `trade_count` - Number of trades in 24h (filtered to ≥100)
- `vwap_token_price` - Volume-weighted average price

**Filters already applied**:
- Graduated in last 24 hours
- Minimum 100 trades (filters out dead/bot tokens)
- Real DEX trading volume

### DexScreener API
**Endpoint**: `api.dexscreener.com/latest/dex/tokens/{mint}`

**What we use**:
- Token name and image
- Market cap
- Website URL
- X (Twitter) link
- `pairCreatedAt` - Token deployment timestamp

---

## Caching Strategy

### Smart Cache Invalidation
1. Fetch Dune metadata (`?limit=0`) - low-cost metadata check
2. Compare `execution_ended_at` with cached value
3. If same -> serve from Convex
4. If different -> full fetch from Dune, enrich, and return live data

### Cache Hit Flow
```
Frontend → Netlify Function → Check Dune metadata
                                    ↓
                            Same as cached?
                            ├─ YES → Serve from Convex (instant)
                            └─ NO  → Fetch from Dune, enrich, return
```

**Known issue**: Only the scheduled sync (00:00/12:00 UTC) stores durable daily snapshots in Convex. Live/manual refreshes should not update `duneMetadata` unless they also store matching token data, otherwise later cache checks can treat stale Convex token data as fresh.

---

## File Structure

```
meta-tracker/
├── .env                          # DUNE_API_KEY, CONVEX_URL
├── .env.local                    # Convex deployment config
├── package.json
├── vite.config.ts
├── netlify.toml
├── PLAN.md                       # This file
│
├── public/
│   └── logo.png                  # Pixel art logo (favicon + header)
│
├── convex/                       # Convex database
│   ├── schema.ts                 # Tables: duneMetadata, dailySnapshots, graduatedTokens
│   ├── duneMetadata.ts           # Cache metadata queries/mutations
│   ├── graduatedTokens.ts        # Token storage and queries
│   └── dailySnapshots.ts         # Historical date listing
│
├── netlify/functions/
│   ├── graduated.ts              # Main API - modes: live, historical, check-freshness
│   ├── available-dates.ts        # List stored historical dates
│   └── scheduled-sync.ts         # Automated 12-hour sync (background function)
│
└── src/
    ├── main.tsx
    ├── App.tsx                   # Main app with historical mode support
    ├── index.css                 # Tailwind + pixel art theme
    │
    ├── components/
    │   ├── Header.tsx            # Logo, date, token count, next sync countdown, refresh
    │   ├── DatePicker.tsx        # Horizontal date pill selector (14 day limit)
    │   ├── TokenList.tsx         # Table with header row, sortable by market cap
    │   ├── TokenRow.tsx          # Token row with website/X links + created time
    │   ├── LoadingScreen.tsx     # Skeleton loading
    │   └── EmptyState.tsx        # Error and empty states
    │
    └── lib/
        ├── types.ts              # TypeScript interfaces
        └── theme.ts              # MUI theme configuration
```

---

## UI Features

### Header
- Clean logo: "meta.tracker" in Inter font (lowercase)
- Last updated timestamp
- Next sync countdown (time until 00:00 or 12:00 UTC)
- Manual refresh button

### Token Table
- **Columns**: #, Image, Token (name/symbol/created time), Market Cap, Links
- **Sorting**: Click Market Cap header to toggle asc/desc
- **Row click**: Opens DexScreener in new tab
- **Social links**: Website (globe) and X icons (when available)
- **Created time**: Shows pair creation time in PST timezone
- **Pagination**: 50 results per page with controls top and bottom

### Date Picker
- Connected ButtonGroup tab selector
- "Today" always first (green when active)
- Historical dates as tabs (purple when selected)
- Limited to last 7 days
- Shows token count on each tab
- Filters out empty snapshots

### Styling
- Clean, professional dark theme
- Dark neutral background (#09090b)
- Muted green (#22c55e) for live/today data
- Soft purple (#a78bfa) for historical data
- Amber (#f59e0b) for token symbols
- Pixel art logo only (not fonts)

---

## API Endpoints

### `GET /.netlify/functions/graduated`

| Param | Values | Description |
|-------|--------|-------------|
| `mode` | `live` (default), `historical`, `check-freshness` | Data mode |
| `date` | `YYYY-MM-DD` | Required for historical mode |
| `force` | `true` | Bypass cache, force fresh fetch |

**Response**:
```json
{
  "tokens": [...],
  "totalCount": 122,
  "fetchedAt": "2025-12-05T...",
  "duneExecutionEndedAt": "2025-12-05T...",
  "source": "live" | "cache" | "historical",
  "snapshotDate": "2025-12-05",  // Server's UTC date (for live/cache modes)
  "enrichment": {
    "failedCount": 2,
    "successRate": 98.5
  }
}
```

### `GET /.netlify/functions/available-dates`

Returns list of dates with stored snapshots for the date picker.

---

## Environment Variables

```bash
# Required
DUNE_API_KEY=your_dune_api_key

# Convex (auto-generated by `npx convex dev`)
CONVEX_URL=https://your-project.convex.cloud
CONVEX_DEPLOYMENT=dev:your-project
```

---

## Running the Project

### Development
```bash
# Install dependencies
npm install

# Start Convex (in separate terminal)
npx convex dev

# Start Netlify dev server
npx netlify dev

# Opens at http://localhost:8888
```

### Force Refresh Data
```bash
curl "http://localhost:8888/.netlify/functions/graduated?force=true"
```

### Production Deploy
```bash
# Deploy Convex
npx convex deploy

# Deploy to Netlify
netlify deploy --prod

# Set environment variables in Netlify dashboard:
# - DUNE_API_KEY
# - CONVEX_URL
```

---

## Convex Database Schema

### `duneMetadata`
Tracks Dune query execution state for cache invalidation.
```typescript
{
  queryId: string,
  lastExecutionEndedAt: string,  // ISO timestamp
  lastFetchedAt: number,          // Unix ms
  totalRowCount: number
}
```

### `dailySnapshots`
Index of available historical dates.
```typescript
{
  date: string,           // "2025-12-05"
  executionEndedAt: string,
  capturedAt: number,
  tokenCount: number
}
```

### `graduatedTokens`
Token data linked to daily snapshots.
```typescript
{
  snapshotDate: string,
  mint: string,
  symbol: string,
  name: string,
  image?: string,
  marketCap?: number,
  liquidity?: number,
  volume24h?: number,
  priceUsd?: number,
  priceChange24h?: number,
  tradeCount?: number,
  createdAt?: number,       // Pair creation timestamp from DexScreener
  linksJson: string,        // JSON: { dexscreener, birdeye, solscan }
  dexScreenerUrl?: string,
  website?: string,
  twitter?: string,
  telegram?: string,
}
```

---

## Scheduled Sync

**Schedule**: `0 0,12 * * *` (00:00 and 12:00 UTC daily)

**Type**: Background function (15-minute timeout)

**Process**:
1. Fetch all tokens from Dune query
2. Enrich with DexScreener (batched, 15 at a time with 500ms delay)
3. Store snapshot in Convex
4. Update metadata cache

---

## API Credit Usage

| Action | Dune Credits |
|--------|--------------|
| Cache hit (metadata check) | ~0 |
| Cache miss (full fetch) | ~400 |
| Historical browse | 0 |
| Scheduled sync | ~400 |

**Monthly estimate**: ~25,000 credits (well within free tier)

---

## Recent Changes

### Dec 7, 2024 (Session 2) - UX Cleanup & Performance

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

### Dec 7, 2024 (Session 1) - MUI Integration & Snapshot Reliability

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

### Dec 6, 2024 - UI Overhaul & Production Deploy

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

### Dec 5, 2024 - Rebrand & Initial Features
- Renamed from "pump.tracker" to "meta.tracker"
- Added pixel art logo (`public/logo.png`)
- Added "Press Start 2P" pixel font for branding
- Dark neutral background (#0a0a0c)
- Added `createdAt` field from DexScreener's `pairCreatedAt`
- Added enrichment tracking with success rate logging
- Force refresh button bypasses cache

---

## Future Improvements

- [ ] Rotate Dune credentials and revoke the exposed key
- [ ] Protect or remove public `force=true`
- [ ] Add durable Convex `syncRuns` observability
- [ ] Add scheduled-sync alerting for missing snapshots
- [ ] Fork or recreate the Dune query under a controlled account/team
- [ ] Fix live metadata/cache mismatch
- [ ] Batch live DexScreener enrichment
- [ ] Add typecheck coverage for Netlify and Convex code
- [ ] Add token search by name/symbol
- [ ] Real-time updates via Helius WebSocket
- [ ] Token watchlist (saved to local storage)
