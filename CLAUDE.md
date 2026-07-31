# CLAUDE.md

Compatibility copy of the canonical [AGENTS.md](AGENTS.md) instructions. Keep
both files aligned so Codex and Claude receive the same project guidance.

## Mission

meta.tracker exists so its owner — a developer who launches his own Solana
memecoins rather than trading them — can read the current meta without being
chronically online.

Memecoins run on speculation and narrative, and the narrative turns over
constantly. Knowing what's working normally means living on X, sitting on the
new-pairs feed, and watching which projects get buys — massive information
overload. This tool replaces that with a glance: the tokens that performed well
each day, in one place, each with its art, name, and direct links to its
website and socials.

The dashboard's job ends at the handoff: surface the winners, link out to their
websites and socials. Working out *why* something worked is the owner's
judgement, done off-site — the tool does not interpret, score, or classify.

A token that ran and then died still counts. A dead runner is evidence of what
caught attention, and current price must never erase it.

The owner competes on execution — the site, the art, the socials, and narrative
fit. Distribution comes entirely from the product itself, not from an existing
audience. That is why art quality and outbound links are load-bearing features,
not decoration.

Reading order: this file is enough for most work. [PLAN.md](PLAN.md) tracks
what remains of the pump.fun migration — read it **before touching the sync
path or peak data**; the evidence behind it is
[docs/HISTORY.md](docs/HISTORY.md)'s 2026-07-28/29 entry. Everything else is
reference, not required reading: [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md)
(known unknowns and deferred cleanups), [README.md](README.md) (architecture +
ops mechanics), [docs/HISTORY.md](docs/HISTORY.md) (past incidents + changelog).
Where this file and another disagree, this file wins; fix the other.

## Success definition and product priorities

- The core inclusion criteria are conjunctive: a token must have graduated
  **and** reached a defensible peak market cap of roughly `$100k+`. The target
  dashboard does not need to list every graduate and ask whether it later met
  the threshold. A short-lived qualifying run still counts; higher peaks are
  additional upside rather than a different definition of success.
- Call the metric **observed peak market cap**, not ATH, for anything derived
  from candle history — that coverage is bounded and must not be presented as
  all-time certainty. pump.fun's `ath_market_cap` *is* a true all-time high, so
  the drawer labels the rows it sourced `ATH market cap`; the table column stays
  `Observed peak` because it mixes both kinds of row.
- **pump.fun's feed contains wash-printed peaks, and we do not yet filter
  them.** Nine-figure "peaks" on ~$1,300 of liquidity; Dune's trade filter was
  incidentally excluding them. **No working filter has been found** — an
  ATH-to-liquidity gate was built, measured, and withdrawn on 2026-07-29 because
  every candidate signal (liquidity, pool share of supply, market cap, retrace)
  moves with the pump's phase, so the same token gets opposite verdicts
  depending on when it is sampled. Peaks are recorded unfiltered for now. Read
  the fake-ATH record in [docs/HISTORY.md](docs/HISTORY.md)'s 2026-07-28/29
  entry before attempting another filter; it documents four failed approaches
  and why.
- **Two measured gaps in the captured cohort (2026-07-31).** Discovery windows
  on *creation* time, not graduation time, so a coin that graduates days after
  launch is never seen — and the feed carries no graduation timestamp to fix it.
  Separately, `ath_market_cap` appears to under-report at the low end: at least
  484 of 850 sampled coins had a live PumpSwap pool yet an ATH below the
  graduation threshold, still unexplained. Both qualify priority 1 below. Don't
  describe the cohort as "everything that graduated today", and treat small ATH
  values as unproven. See [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md).
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

Data flow: `pump.fun /coins?complete=true → Netlify scheduled-sync (every 2h,
UTC) → DexScreener enrichment → Convex snapshots + audit → React (/api/*)`.
pump.fun supplies discovery, art, links, live market cap and a reported ATH;
DexScreener adds volume, liquidity and 24h change only; `/api/graduated` is a
pure Convex reader that calls no source at all.

**Deployed and verified in production on 2026-07-31.** The first run captured
809 graduates over 17 pages with 100% DexScreener enrichment and a reported ATH
on every one, taking the dashboard from 23 tokens and 4 clearing `$100k` to 818
and 298. The Dune code path stays in the tree until the retirement step in
[PLAN.md](PLAN.md). The query it replaces (`4124453`, third-party) missed ~95%
of graduations: 52 rows against 995 in the same 24h window, because it matches
one hardcoded bonding-curve instruction that PumpSwap migrations bypass.

**Not yet proven: pump.fun answering a Netlify IP.** Every successful fetch so
far, including the one that wrote the first production snapshot, came from a
residential IP. pump.fun is Cloudflare-fronted, so the first *scheduled* run is
the real test — see PLAN.md step 1 before assuming the transport is settled.

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
  graduated.ts            Snapshot reader (latest / historical); calls no source
  scheduled-sync.ts       Every-2h cron writer (background function)
  peak-backfill.ts        Hourly observed-peak reader (background function)
  health.ts               Convex-backed health endpoint (sync + feed recency)
  backfill.ts             Admin-only historical repair (POST)
  available-dates.ts      Snapshot date list for the date picker
  _shared/                token-sync (pump.fun + DexScreener engine; the Dune
                          reader survives only for backfill.ts), solana-tracker
                          (observed peak; superseded by pump.fun's ATH), retry,
                          sync-health, api-contract
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
  works. Never print/commit/log it. Since 2026-07-31 it gates only
  `POST /api/backfill` — the dashboard no longer depends on it, so revoking it
  costs historical repair beyond pump.fun's ~24h reach and nothing else.
- **Production Convex is `dusty-ox-307`.** A second deployment
  (`qualified-hound-245`) exists; switching `CONVEX_URL` is a deliberate data
  migration, not a casual change. `dusty-ox-307` is Convex's *dev* deployment, so
  `npx convex deploy` pushes to the wrong one (`qualified-hound-245`); update the
  live store with `npx convex dev --once` (verify via `npx convex dashboard
  --no-open`). **Push Convex before Netlify, always** — functions call Convex
  queries by name, so a Netlify-first deploy 500s every request using a new one
  until the store catches up (measured 2026-07-31 on `dailySnapshots.latest`).
- **Only scheduled-sync and admin backfill write durable snapshots.**
  `/api/graduated` is a pure reader and must not regain a live-fetch path: a
  full cohort needs minutes of paced enrichment, which a request handler does
  not have. Recency belongs to `syncRuns` + `/api/health`.
- **After any Netlify deploy that touches functions, verify** deploy metadata
  registers *both* schedules: `scheduled-sync` at `0 */2 * * *` and
  `peak-backfill` at `20 * * * *`. TypeScript passing does not prove a cron
  registered.
- **Date tabs = rolling snapshot windows**, not DexScreener `pairCreatedAt`
  buckets. Don't group history by `pairCreatedAt`.
- **Health source is `syncRuns` + `/api/health`**, not snapshot presence.
  Health is recency-based on two tiers: a sync succeeded within ~4.5h (two 2h
  intervals + grace), *and* the newest token the feed offered is under ~6.5h
  old. The second tier is what catches a source that answers happily with a
  frozen page. Today's data is still one snapshot row, overwritten each run.
- **DexScreener throttles above ~5 req/sec.** A bulk run at ~14/sec returns
  empty `volume`/`liquidity` with no error, which reads as "this token has no
  market" and will lead you to the wrong conclusion. `enrichTokens` paces at 5
  in flight per second and a covering test asserts it; do not raise it.
- **pump.fun's API is undocumented and moves.** No key or quota, but v1 and v2
  are already retired, and the community spec
  ([BankkRoll/pumpfun-apis](https://github.com/BankkRoll/pumpfun-apis)) is a
  2026-06-17 snapshot of which ~95% now 404s. Confirmed working: `/coins`,
  `/coins/{mint}` and `/coins/currently-live` on `frontend-api-v3`, and
  `/coins/graduated` on the second host `advanced-api-v2` (only ~1.9h deep —
  see HISTORY's 2026-07-28/29 entry). Probe before believing any endpoint, and
  always keep the DexScreener fallback so failure degrades instead of breaking.
  Verified 2026-07-31 against `/coins?complete=true`: the response is a **bare
  array**, not `{coins:[...]}`; `complete=true` really is applied; and a 24h
  window is ~17 pages / ~850 coins.
- **Scheduled functions are not externally invocable.** `POST
  /api/scheduled-sync` returns 403 in production — Netlify blocks outside calls
  while still granting the 15-minute background runtime. To run one on demand,
  execute the handler locally (see Verify below).
- **`POST /api/backfill` is admin-only** (`ADMIN_REFRESH_TOKEN`); start
  backfills with `dryRun=true`. It is the last Dune consumer left.

## Verify before declaring done

- UI changes: run `netlify dev` and look — drawer, freshness states, clean
  console. Compiling is not "looking right".
- Backend changes: the typecheck + test commands above, **then actually run the
  thing**. On 2026-07-31 every gate passed — build, both typechecks, 53 tests —
  while `scheduled-sync`'s write path had never executed anywhere and
  `graduated.ts` was calling a Convex function that did not exist on the
  deployed store. Neither failure is visible to a typecheck.
- To run a Netlify handler without deploying, compile it to CommonJS *inside the
  project* (so `node_modules` resolves), copy in `convex/_generated`, and call
  its exported handler with `CONVEX_URL` set — recipe in [PLAN.md](PLAN.md)'s
  verification loop. This writes to whichever Convex deployment `CONVEX_URL`
  names, so it is a real production write when pointed at `dusty-ox-307`.
- `npm run build` emits a known Vite chunk-size warning — that is not a failure.
