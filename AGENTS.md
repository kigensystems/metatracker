# AGENTS.md

Canonical instructions for agents working in this repository. Keep
[CLAUDE.md](CLAUDE.md) aligned for Claude compatibility.

Quick reference for working in this repo. Deeper docs: [README.md](README.md).
Forward plan: [PLAN.md](PLAN.md). Past incidents + changelog:
[docs/HISTORY.md](docs/HISTORY.md). Authoritative next-session handoff:
[docs/HANDOFF-2026-07-28-pumpfun-migration.md](docs/HANDOFF-2026-07-28-pumpfun-migration.md).

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
- Call the metric **observed peak market cap**, not ATH, for anything derived
  from candle history — that coverage is bounded and must not be presented as
  all-time certainty. pump.fun's `ath_market_cap` *is* a true all-time high and
  may be labelled as such once it is wired in (see the migration handoff).
- **A peak is only credible if the pool backing it was real.** pump.fun's feed
  includes wash-pumped tokens printing nine-figure "peaks" on ~$1,300 of
  liquidity; Dune's trade filter was incidentally excluding them. Gate any peak
  on an ATH-to-liquidity sanity check measured at capture time. Never
  manufacture a peak from a single tiny trade.
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

meta.tracker is a dashboard for recently graduated Solana tokens. Its job is to
show a solo creator what launched, what it looked like, and whether it worked —
so they can decide what to build next.

Data flow **as deployed today**: `Dune query 4124453 → Netlify scheduled-sync
(every 2h, UTC) → DexScreener enrichment → Convex snapshots + audit → React
(/api/*)`.

**This is mid-migration.** Query 4124453 is not ours, and it misses ~95% of
graduations (52 rows against 995 in the same 24h window) because it matches one
hardcoded bonding-curve instruction that PumpSwap migrations bypass. Its market
cap is derived from at most 7 trades. A verified pump.fun replacement is
committed but **not wired in**; discovery, art, links, market cap and ATH all
move to pump.fun, leaving DexScreener for volume/liquidity/24h change only. Read
[docs/HANDOFF-2026-07-28-pumpfun-migration.md](docs/HANDOFF-2026-07-28-pumpfun-migration.md)
before changing the sync path.

## Stack

React 19 + Vite 8 + MUI 7 · Netlify Functions (TypeScript) · Convex (durable
storage) · GitHub Actions (health monitor). Production: Netlify site
`metratrackerapp.netlify.app`, Convex deployment `dusty-ox-307`.

## Layout

```
src/
  App.tsx                 Main state, fetch flow, client-side cache
  components/             Header, ControlBar (DatePicker + filter), NextRuns
                          (cron countdowns), TokenList, TokenRow, PeakCell,
                          RowActions (external links), TokenDetailDrawer,
                          FreshnessBar, Loading/Empty
  lib/                    types.ts, theme.ts (palette + LABEL/FIGURE tokens),
                          peak.ts ($100k qualification), token-links.ts,
                          schedule.ts (cron countdown maths), format.ts
netlify/functions/
  graduated.ts            Main data API (live / historical / check-freshness)
  scheduled-sync.ts       Every-2h cron writer (background function)
  peak-backfill.ts        Hourly observed-peak reader (background function)
  health.ts               Convex-backed health endpoint (no Dune call)
  backfill.ts             Admin-only historical repair (POST)
  available-dates.ts      Snapshot date list for the date picker
  _shared/                token-sync (Dune + pump.fun + DexScreener engine),
                          solana-tracker (observed peak; redundant once pump.fun
                          ATH is wired), retry, sync-health, api-contract
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
- **DexScreener throttles above ~5 req/sec.** A bulk run at ~14/sec returns
  empty `volume`/`liquidity` with no error, which reads as "this token has no
  market" and will lead you to the wrong conclusion. Pace bulk enrichment.
- **pump.fun's API is undocumented and moves.** No key or quota, but v1 and v2
  are already retired, and the community spec
  ([BankkRoll/pumpfun-apis](https://github.com/BankkRoll/pumpfun-apis)) is a
  2026-06-17 snapshot of which ~95% now 404s. Only `/coins`, `/coins/{mint}`
  and `/coins/currently-live` are confirmed working. Probe before believing any
  endpoint, and always keep the DexScreener fallback so failure degrades
  instead of breaking.
- **`force=true` and `POST /api/backfill` are admin-only** (`ADMIN_REFRESH_TOKEN`);
  start backfills with `dryRun=true`.

## Verify before declaring done

- UI changes: run `netlify dev` and look — drawer, freshness states, clean
  console. Compiling is not "looking right".
- Backend changes: the typecheck + test commands above.
- `npm run build` emits a known Vite chunk-size warning — that is not a failure.
