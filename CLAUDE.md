# CLAUDE.md

Quick reference for working in this repo. Deeper docs: [README.md](README.md).
Forward plan: [PLAN.md](PLAN.md). Past incidents + changelog:
[docs/HISTORY.md](docs/HISTORY.md).

## What this is

meta.tracker is a dashboard for recently graduated Solana tokens. A Dune query
returns the token list; Netlify Functions enrich it via DexScreener and store
durable snapshots in Convex; a React/Vite + MUI frontend reads it through
`/api/*`.

Data flow: `Dune query 4124453 → Netlify scheduled-sync (every 2h, UTC) →
DexScreener enrichment → Convex snapshots + audit → React (/api/*)`.

## Stack

React 19 + Vite 8 + MUI 7 · Netlify Functions (TypeScript) · Convex (durable
storage) · GitHub Actions (health monitor). Production: Netlify site
`metratrackerapp.netlify.app`, Convex deployment `dusty-ox-307`.

## Layout

```
src/
  App.tsx                 Main state, fetch flow, client-side cache
  components/             Header, DatePicker, TokenList, TokenRow,
                          TokenDetailDrawer, FreshnessBar, Loading/Empty
  lib/                    types.ts (shared types), theme.ts (MUI theme)
netlify/functions/
  graduated.ts            Main data API (live / historical / check-freshness)
  scheduled-sync.ts       Every-2h cron writer (background function)
  health.ts               Convex-backed health endpoint (no Dune call)
  backfill.ts             Admin-only historical repair (POST)
  available-dates.ts      Snapshot date list for the date picker
  _shared/                token-sync (Dune+DexScreener engine), retry, sync-health
convex/
  schema.ts               Tables: duneMetadata, dailySnapshots, syncRuns, graduatedTokens
  graduatedTokens.ts      storeSnapshot (write-guards) + token reads
  dailySnapshots.ts, duneMetadata.ts, syncRuns.ts
.github/workflows/health-monitor.yml   External /api/health monitor + issue alerts
```

## Commands

```
npx netlify dev              # local dev at http://localhost:8888 (needs .env.local)
npm run dev                  # vite only; VITE_API_BASE=<prod>/api drives UI off prod data
npm run build                # tsc + vite (frontend typecheck + bundle)
npm run typecheck:functions  # typecheck Netlify functions
npm run test:health          # reliability / sync-health unit tests
npx tsc --noEmit -p convex/tsconfig.json   # typecheck Convex
```

## Guardrails (read before touching backend / ops)

- **Dune key is fragile and exposed.** Account reportedly banned; key still
  works. Never print/commit/log it; don't rotate or revoke until a tested
  replacement exists.
- **Production Convex is `dusty-ox-307`.** A second deployment
  (`qualified-hound-245`) exists; switching `CONVEX_URL` is a deliberate data
  migration, not a casual change.
- **Only scheduled-sync and admin backfill write durable snapshots.** Live /
  manual fetches may return fresh data but must not advance `duneMetadata`
  unless a matching snapshot is stored.
- **After any Netlify deploy that touches functions, verify** deploy metadata
  has `function_schedules: [{ name: "scheduled-sync", cron: "0 */2 * * *" }]`.
  TypeScript passing does not prove the cron registered.
- **Date tabs = rolling snapshot windows**, not DexScreener `pairCreatedAt`
  buckets. Don't group history by `pairCreatedAt`.
- **Health source is `syncRuns` + `/api/health`**, not snapshot presence.
  Health is recency-based: OK when a sync succeeded within ~4.5h (two 2h
  intervals + grace), so it never false-alarms on historical slots after a
  cadence change. Today's data is still one snapshot row, overwritten each run.
- **`force=true` and `POST /api/backfill` are admin-only** (`ADMIN_REFRESH_TOKEN`);
  start backfills with `dryRun=true`.

## Verify before declaring done

- UI changes: run `netlify dev` and look — drawer, freshness states, clean
  console. Compiling is not "looking right".
- Backend changes: the typecheck + test commands above.
- `npm run build` emits a known Vite chunk-size warning — that is not a failure.
