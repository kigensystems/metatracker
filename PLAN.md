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
│  • Social links (website, twitter, telegram)        │
│  • Live/Historical toggle                           │
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
- Social links (Twitter, Telegram)
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
    │   ├── Header.tsx            # Pixel font logo, stats, Dune freshness indicator
    │   ├── DatePicker.tsx        # Live/Historical toggle + date selector
    │   ├── TokenList.tsx         # Table with header row, sortable by market cap
    │   ├── TokenRow.tsx          # Individual token row with social links + created time
    │   ├── LoadingScreen.tsx     # Skeleton loading
    │   └── EmptyState.tsx        # Error and empty states
    │
    └── lib/
        └── types.ts              # TypeScript interfaces
```

---

## UI Features

### Token Table
- **Columns**: #, Image, Token (name/symbol/created time), Market Cap, Links
- **Sorting**: Click Market Cap header to toggle asc/desc
- **Row click**: Opens DexScreener in new tab
- **Social links**: Website (globe), Twitter, Telegram icons (when available)
- **Created time**: Shows pair creation time in PST timezone

### Historical Mode
- Toggle between Live and Historical view
- Date picker shows available snapshot dates
- Browse past token data stored in Convex

### Styling
- Pixel art aesthetic with "Press Start 2P" font for branding
- Dark neutral background (#0a0a0c)
- Neon green (#39ff14) for positive values and accents
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

## Recent Changes (Dec 2024)

### Rebrand to meta.tracker
- Renamed from "pump.tracker" to "meta.tracker"
- Added pixel art logo (`public/logo.png`)
- Updated favicon and apple-touch-icon
- Package name changed to `meta-tracker`

### UI/Styling Updates
- Added "Press Start 2P" pixel font for branding
- Dark neutral background (removed blue/purple tint)
- Removed grid background pattern
- Neon green (#39ff14) and gold (#ffd700) accent colors
- Pixelated logo rendering with `image-rendering: pixelated`

### Error Handling Improvements
- Added enrichment tracking to `graduated.ts` and `scheduled-sync.ts`
- API responses now include `enrichment.failedCount` and `enrichment.successRate`
- Graceful degradation when DexScreener fails for some tokens
- Logging for failed enrichments in scheduled sync

### New Features
- **Token creation time**: Added `createdAt` field from DexScreener's `pairCreatedAt`
- Displays in PST timezone on token rows (e.g., "Dec 5, 2:30 PM")
- **Force refresh**: Refresh button now passes `force=true` to bypass cache

### Code Cleanup
- Removed unused `recharts` dependency
- Removed empty `src/hooks/` directory
- Added `@deprecated` JSDoc comments to legacy schema fields
- Cleaned up unused imports (Zap icon, framer-motion in some components)

---

## Future Improvements

- [ ] Add token search by name/symbol
- [ ] Fork the Dune query for control over execution schedule
- [ ] Real-time updates via Helius WebSocket
- [ ] Token watchlist (saved to local storage)
