# CLAUDE.md

Compatibility copy of the canonical [AGENTS.md](AGENTS.md) instructions. Keep
both files aligned so Codex and Claude receive the same project guidance.

Quick reference for working in this repo. Deeper docs: [README.md](README.md).
Forward plan: [PLAN.md](PLAN.md). Past incidents + changelog:
[docs/HISTORY.md](docs/HISTORY.md). Authoritative next-session handoff:
[docs/HANDOFF-2026-07-28.md](docs/HANDOFF-2026-07-28.md).

## Product mission

meta.tracker is a personal research dashboard for a solo memecoin creator. Its
target cohort is recently graduated tokens that also reached a defensible peak
market cap of roughly `$100k+`, including tokens that later died. Its job is to
make a fast, hyper-competitive market understandable without requiring the user
to watch launches all day. The dashboard should help answer:

1. Which recent tokens both graduated and crossed the `$100k+` threshold?
2. Which launches performed well, including brief runners that later died?
3. What names, visuals, niches, and ideas appear to be attracting buyers?
4. Which tokens are worth opening for deeper manual research?
5. Eventually, which hours and weekdays offer the strongest conditions for a
   solo creator to launch?

This is not a general analytics product or an automated trading system. The
current product is an exploratory dashboard. Generated briefings and tools for
evaluating the user's own concepts are later possibilities, after the data and
core UX are trustworthy and polished.

## Success definition and product priorities

- The core inclusion criteria are conjunctive: a token must have graduated
  **and** reached a defensible peak market cap of roughly `$100k+`. The target
  dashboard does not need to list every graduate and ask whether it later met
  the threshold. A short-lived qualifying run still counts; higher peaks are
  additional upside rather than a different definition of success.
- Until the available history can prove a true all-time high, call the metric
  **observed peak market cap**, not ATH. Never manufacture a peak from a single
  tiny trade or present incomplete coverage as all-time certainty.
- Volume, liquidity, buy/sell activity, retention, time-to-peak, and longevity
  are supporting evidence. They help the user judge the strength of an idea or
  niche, but they do not disqualify a brief `$100k+` runner.
- Preserve dead runners in exploration and ranking views. Current market cap
  alone must not erase evidence that a token previously earned attention.
- Prefer understandable measurements, sortable views, and direct source links
  over opaque composite scores or automatic narrative classification.
- Treat on-chain and market data as evidence of **what** happened. Explanations
  of **why** a token worked are interpretations unless supported by branding,
  website, social, cultural, or other contextual evidence. Label observation
  and inference distinctly.
- Freshness and source timing matter because the meta changes quickly. Display
  stale, mixed-time, or partial data honestly rather than implying it is live.
- For future launch-timing analysis, compare outcomes with competition as well
  as raw market volume. The useful question is when attention relative to the
  number and quality of competing launches is strongest.

Prioritize work in this order unless the user directs otherwise:

1. Accurate capture of the graduated-and-`$100k+` qualifying cohort.
2. Clear source semantics and preservation of brief runners.
3. Fast, polished desktop and mobile exploration UX.
4. Evidence-based time-of-day and day-of-week analysis.
5. Generated briefings and assistance evaluating the user's own concepts.

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
  peak-backfill.ts        Hourly observed-peak reader (background function)
  health.ts               Convex-backed health endpoint (no Dune call)
  backfill.ts             Admin-only historical repair (POST)
  available-dates.ts      Snapshot date list for the date picker
  _shared/                token-sync (Dune+DexScreener engine), solana-tracker
                          (observed peak), retry, sync-health
convex/
  schema.ts               Tables: duneMetadata, dailySnapshots, syncRuns,
                          graduatedTokens, observedPeaks
  graduatedTokens.ts      storeSnapshot (write-guards) + token reads
  observedPeaks.ts        pending queue, byMints read, record write
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
  migration, not a casual change. `dusty-ox-307` is Convex's *dev* deployment, so
  `npx convex deploy` pushes to the wrong one (`qualified-hound-245`); update the
  live store with `npx convex dev --once` (verify via `npx convex dashboard
  --no-open`).
- **Only scheduled-sync and admin backfill write durable snapshots.** Live /
  manual fetches may return fresh data but must not advance `duneMetadata`
  unless a matching snapshot is stored.
- **After any Netlify deploy that touches functions, verify** deploy metadata
  registers *both* schedules: `scheduled-sync` at `0 */2 * * *` and
  `peak-backfill` at `20 * * * *`. TypeScript passing does not prove a cron
  registered.
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
