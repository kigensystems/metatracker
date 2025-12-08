# meta.tracker - Graduated Token Monitor

## Project Overview

A dashboard to track graduated Solana tokens from a Dune Analytics query, enriched with market data and social links from DexScreener. Features smart caching via Convex database, historical browsing, and automated data sync.

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
1. Fetch Dune metadata (`?limit=0`) - nearly free API call
2. Compare `execution_ended_at` with cached value
3. If same → serve from Convex (instant)
4. If different → full fetch from Dune, enrich, return (no storage)

### Cache Hit Flow
```
Frontend → Netlify Function → Check Dune metadata
                                    ↓
                            Same as cached?
                            ├─ YES → Serve from Convex (instant)
                            └─ NO  → Fetch from Dune, enrich, return
```

**Note**: Only the scheduled sync (00:00/12:00 UTC) stores snapshots in Convex. Manual refreshes update cache metadata but don't create snapshots. This prevents duplicate/overlapping data from timezone edge cases.

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

- [ ] Add token search by name/symbol
- [ ] Fork the Dune query for control over execution schedule
- [ ] Real-time updates via Helius WebSocket
- [ ] Token watchlist (saved to local storage)
