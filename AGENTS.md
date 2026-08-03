# AGENTS.md

`CLAUDE.md` is a symlink to this file. One file, no drift.

## This tool is finished. Propose before building.

meta.tracker shows its owner — a solo dev who launches Solana memecoins rather
than trading them — which tokens performed each day, with their art and links to
their site and socials. It is deployed, working, and does the job.

**Default to answering questions and proposing, not building.** Do not start
work because a doc lists something as open. Do not write documentation unless
asked. Do not refactor adjacent code. If you think something needs doing, say so
in a sentence and stop.

The dashboard's job ends at the handoff: surface the winners, link out. Working
out *why* something worked is the owner's judgement, done off-site. A token that
ran and then died still counts — current price must never erase it.

The qualifying bar is conjunctive: graduated **and** an observed peak of
`$100k+` (`PEAK_THRESHOLD` in `src/lib/peak.ts`).

## Stack and data flow

React 19 + Vite 8 + MUI 7 · Netlify Functions (TypeScript) · Convex · GitHub
Actions (health monitor). Production: `metratrackerapp.netlify.app`, Convex
`dusty-ox-307`.

```
pump.fun /coins?complete=true → Netlify scheduled-sync (every 2h, UTC)
  → DexScreener enrichment → Convex snapshots + audit → React (/api/*)
```

pump.fun supplies discovery, art, links, live market cap and a reported ATH.
DexScreener adds volume, liquidity and 24h change only. `/api/graduated` is a
pure Convex reader that calls no source at all.

Architecture and ops mechanics: [README.md](README.md). Incident log and
changelog, including the evidence behind every claim here:
[docs/HISTORY.md](docs/HISTORY.md).

## Commands

```
npx netlify dev              # local dev at http://localhost:8888 (needs .env.local)
npm run build                # tsc + vite (a Vite chunk-size warning is normal)
npm run typecheck:functions  # typecheck Netlify functions
npm run test:health          # reliability / sync-health unit tests
npx tsc --noEmit -p convex/tsconfig.json   # typecheck Convex
```

## Guardrails — these prevent real damage

- **Push Convex before Netlify, always.** Functions call Convex queries by name,
  so a Netlify-first deploy 500s every request using a new one.
- **Never `npx convex deploy`** — it targets the wrong deployment
  (`qualified-hound-245`). Update the live store with `npx convex dev --once`.
  Production is `dusty-ox-307`; changing `CONVEX_URL` is a data migration.
- **DexScreener throttles above ~5 req/sec** by returning 200s with empty
  `volume`/`liquidity` — which reads as "no market" and will lead you to the
  wrong conclusion. `enrichTokens` paces at 5 in flight per second. Do not raise it.
- **`/api/graduated` is a pure reader** and must not regain a live-fetch path; a
  full cohort needs minutes of paced enrichment.
- **After any deploy touching functions, verify both crons registered *and*
  still run in background mode**: `scheduled-sync` at `0 */2 * * *`,
  `peak-backfill` at `20 * * * *`. The property that buys the 15-minute runtime
  is `background: true`; an invented `type: "background"` typechecks, deploys,
  and is silently ignored, leaving a 30-second cap that kills every sync
  mid-enrichment without logging an error. Check the deployed invocation mode:

  ```
  npx netlify api getDeploy --data '{"deploy_id":"<id>"}' \
    | jq -r '.available_functions[]|select(.n=="scheduled-sync")|.im'
  ```

  It must print `background`. `stream` means synchronous, and the sync is dead.
  A passing typecheck proves nothing here — this shipped broken for days.
- **pump.fun's API is undocumented and moves.** v1 and v2 are already retired.
  Probe before believing any endpoint, and keep the DexScreener fallback so
  failure degrades instead of breaking.
- **Scheduled functions are not externally invocable** — `POST
  /api/scheduled-sync` returns 403. To run one on demand, compile the handler to
  CommonJS inside the project, copy in `convex/_generated`, and call its exported
  handler with `CONVEX_URL` set. That is a real production write.
- **The Dune key is fragile and exposed** (account reportedly banned, key still
  works). Never print, commit, or log it. It now gates only `POST /api/backfill`.

## Data caveats worth knowing

- **Graduation is 400 SOL of market cap, not `$69k`.** That dollar figure is 400
  SOL at ~`$172/SOL`. Never hardcode a USD graduation number — derive SOL price
  per row from `usd_market_cap / market_cap_quote`.
- **~31% of the `complete=true` feed is Mayhem Mode**, where a pump.fun AI agent
  trades the coin. Those reach `complete: true` without clearing 400 SOL. The
  `$100k` bar already excludes 259 of 266 of them, so this needs no code — just
  don't quote "N graduates" off the raw feed count.
- **Wash-printed peaks are in the data and unfiltered.** Four filters were built
  and all failed, because every capture-time signal moves with the pump's phase.
  Read HISTORY's 2026-07-28/29 entry before attempting a fifth.
- **Discovery windows on creation time, not graduation time**, so a coin that
  graduates days after launch is never seen. The feed carries no graduation
  timestamp to fix it. Don't call the cohort "everything that graduated today".
- **Date tabs are rolling snapshot windows**, not DexScreener `pairCreatedAt`
  buckets. Health is recency-based off `syncRuns` + `/api/health`, not snapshot
  presence.

## Verify before declaring done

Run the typecheck and test commands above, **then actually run the thing**. On
2026-07-31 every gate passed — build, both typechecks, 53 tests — while
`scheduled-sync`'s write path had never executed anywhere. For UI changes, run
`netlify dev` and look. For infrastructure questions, use a draft deploy (`npx
netlify deploy --build`, no `--prod`), which runs functions on real Netlify
infrastructure without touching production.
