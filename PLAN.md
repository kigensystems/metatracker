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
4. If different → full fetch, enrich, store in Convex

### Cache Hit Flow
```
Frontend → Netlify Function → Check Dune metadata
                                    ↓
                            Same as cached?
                            ├─ YES → Serve from Convex (instant)
                            └─ NO  → Fetch from Dune, enrich, store, return
```

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
        └── types.ts              # TypeScript interfaces
```

---

## UI Features

### Header
- Pixel font logo (META.TRACKER)
- Current date display (Today/Yesterday/Dec 4)
- Token count
- Last updated timestamp
- Next sync countdown (time until 00:00 or 12:00 UTC)
- Manual refresh button

### Token Table
- **Columns**: #, Image, Token (name/symbol/created time), Market Cap, Links
- **Sorting**: Click Market Cap header to toggle asc/desc
- **Row click**: Opens DexScreener in new tab
- **Social links**: Website (globe) and X icons (when available)
- **Created time**: Shows pair creation time in PST timezone

### Date Picker
- Horizontal pill-based selector
- "Today" always first (green when active)
- Historical dates as pills (purple when selected)
- Limited to last 14 days
- Shows token count on each pill
- Filters out empty snapshots

### Styling
- Pixel art aesthetic with "Press Start 2P" font for branding
- Dark neutral background (#0a0a0c)
- Neon green (#39ff14) for live/today data
- Neon purple (#aa55ff) for historical data
- Gold/amber (#ffd700) for token symbols
- Pixelated logo rendering

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
