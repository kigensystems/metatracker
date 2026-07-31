# meta.tracker — Plan

What is left of the switch from Dune to pump.fun. The pipeline is wired and
locally verified; deploying it and retiring what it obsoletes are the remaining
steps. Evidence, measurements, and API verification behind every claim here live
in [docs/HISTORY.md](docs/HISTORY.md)'s 2026-07-28/29 and 2026-07-30 entries —
read them before touching the sync path. Mission and guardrails live in
[AGENTS.md](AGENTS.md).

## Purpose

The product mission lives in [AGENTS.md](AGENTS.md) (mirrored in CLAUDE.md) and
is authoritative there. Short version: one place to see which launches
performed, with art and outbound links, so the owner can judge the meta without
living on X. The qualifying cohort — graduated **and** a defensible ~`$100k+`
peak, dead runners included — is defined in AGENTS.md's success-definition
section.

## Current state

**Implemented and verified locally on 2026-07-30; not deployed.** Production
still runs the Dune pipeline until the next push to `main`.

Wired: `scheduled-sync` discovers through pump.fun `/coins?complete=true`,
enriches through DexScreener at 5 requests in flight per second, stores the
snapshot with the capture time as its source timestamp, and records each
reported ATH into `observedPeaks` in batches of 50. `/api/graduated` is a pure
Convex reader — the live-fetch, force-refresh and Dune freshness-comparison
paths are gone. Health's second staleness tier now measures feed freshness (the
newest creation time the feed offered) instead of a Dune execution age.

Verified against the live API end to end, without deploying or writing to
Convex: 34 graduates in a one-hour window, 100% DexScreener coverage with
non-empty liquidity *and* volume for all of them, 100% art, 100% reported ATH,
at 5.0 tokens/sec. The UI was driven against that cohort — art, links, peaks,
the `Cleared $100K` filter, and the drawer's source-timing block all render.

Still on Dune: `POST /api/backfill` only. `peak-backfill` + Solana Tracker still
run and still own the peaks for every row captured before the migration.

## What remains

Open questions and deferred cleanups that are *not* deploy steps live in
[docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md) — read it before assuming the
pump.fun data is fully understood.

### 1. Deploy, in dependency order

1. `npx convex dev --once` (live store is `dusty-ox-307`; never
   `npx convex deploy` — see AGENTS guardrails). **This order is load-bearing
   now, not just prudent:** `/api/graduated` calls the new
   `dailySnapshots.latest` query, so deploying Netlify first breaks every
   dashboard load until Convex catches up.
2. Push to `main` → Netlify.
3. Verify deploy metadata registers **both** schedules: `scheduled-sync`
   (`0 */2 * * *`) and `peak-backfill` (`20 * * * *`). TypeScript passing does
   not prove a cron registered.
4. Watch one scheduled run end-to-end: `/api/health` OK, snapshot row count
   ~20x larger, art/links/peaks populated, drawer sane.

**The pre-flight probe was skipped by the owner's decision.** Every measurement
so far ran from a residential IP, and pump.fun is Cloudflare-fronted; datacenter
egress may be treated differently. If the first scheduled run returns an empty
feed, that is the likely cause — the sync refuses to store an empty cohort, so
the failure is loud and the previous snapshot survives. The migration would then
need a different transport.

### 2. Retire what the migration obsoletes (only after step 1 is verified)

Deleting these early would remove the rollback reference, so they wait.

- `peak-backfill.ts` + `_shared/solana-tracker.ts` + `SOLANA_TRACKER_API_KEY`
  + `tests/solana-tracker.test.mjs`. Keep the `observedPeaks` table — ATH
  lands there. Spot-check one Raydium-migrated token's ATH first (only
  PumpSwap ones were verified).
- Dune-only code: the live-fetch/backfill machinery in `token-sync.ts`,
  `backfill.ts`, `DUNE_API_KEY`/`DUNE_BACKFILL_QUERY_ID`.
  **Accept the consequence:** pump.fun's feed reaches back ~24h, so
  historical repair beyond that stops being possible once Dune goes. Convex
  becomes the only history.
- Prune write-only `dune*` fields from `syncRuns` / `dailySnapshots` and drop
  the now-unwritten `duneMetadata` table (schema migration — propose first).
  `syncRuns.duneExecutionEndedAt` carries feed freshness now and wants the
  rename in the same pass.

## Verification loop (no deploy, no Convex writes)

Compile the sync engine standalone:

```bash
npx tsc --target ES2022 --module NodeNext --moduleResolution NodeNext \
  --strict --skipLibCheck --outDir /tmp/out \
  netlify/functions/_shared/token-sync.ts \
  netlify/functions/_shared/retry.ts \
  netlify/functions/_shared/api-contract.ts
```

Then a small script that runs `fetchGraduatedFromPumpFun` → `enrichTokens` →
`withObservedPeaks` → `toApiToken`, writes the result as a
`/api/graduated`-shaped JSON, and serves it on `:8899`. Point the UI at it:

```bash
VITE_API_BASE="http://localhost:8899" npx vite --port 5173
```

Only a `Latest` tab appears against the fixture — date tabs come from stored
Convex snapshots, which the fixture has none of. Three gotchas: node's `fetch`
fails DNS under the tool sandbox (run such scripts with the sandbox disabled);
the fixture server must re-read its JSON per request, or restart after
regenerating, or you will screenshot stale data; and **check that port 8899 is
actually yours** — a fixture server left running by an earlier session answers
happily with a days-old cohort, and nothing about the response says so.

## Preservation contract

The current production iteration must keep working throughout. Existing Convex
documents, `/api/*` response shapes, historical snapshots, and the React table
are a compatibility contract:

- Do not rename, remove, or change the meaning of existing token fields. New
  Convex fields are optional; new API properties are additive and nullable.
- Old snapshots lack the new fields; the API and UI must render them with the
  current market-cap/volume presentation rather than failing.
- Keep the empty-result, partial-result, malformed-row, historical-overwrite,
  and token-retention guards in `storeSnapshot` and token sync.
- Each stage deploys independently and is reversible; the Dune path stays
  intact as the rollback reference until the retirement step above.

## Parked — decided, not planned, or rejected

- **Fake-ATH filtering: parked by the owner (2026-07-29).** Peaks are recorded
  unfiltered. Four approaches were built and failed; the fake-ATH record in
  [docs/HISTORY.md](docs/HISTORY.md) is the mandatory read before attempting a
  fifth. Most promising
  untried signal: a conservative floor on holder count (the only measured
  signal that does not move with a pump's phase).
- Sort presets over the table (Trending / Best runners / Newest) — old idea,
  neither shipped nor rejected. Propose before building.
- `reply_count` (pump.fun social signal) — free, unused, undiscussed.
- `ROW_GRID` single column-definition array — worthwhile only when the table
  next changes columns. The column layout is hand-synced across the template
  in `TokenRow.tsx`, the header cells in `TokenList.tsx`, and the row cells;
  a mismatch misaligns values under headers silently.
- Rejected outright (do not re-propose): keyword/theme leaderboard, $100K
  threshold rail/slider, creator/launch-farm clustering, search bar,
  icon-only or boxed/chip row links.

## Reliability work that should not derail the product change

- [ ] Gate public invocation of `/api/scheduled-sync` without breaking Netlify
      scheduled invocations. Netlify's non-public scheduled functions have a
      30-second limit, while this enrichment job needs the 15-minute background
      runtime; use a scheduled dispatcher plus an authenticated background
      worker rather than trusting a spoofable request body.

Completed reliability items are recorded in [docs/HISTORY.md](docs/HISTORY.md).

## Active risks

- **pump.fun is an undocumented dependency.** No ToS, no SLA, no rate-limit
  headers; ~95% of its documented endpoints vanished in ~6 weeks. Keep the
  DexScreener fallback so failure degrades instead of breaking; Convex remains
  the durable asset once a token is captured.
- **Wash-printed peaks are in the data** until a filter exists (see Parked).
  The top of the peak-sorted list will contain fabricated numbers.
- **Mixed timestamps.** pump.fun and DexScreener values can describe different
  moments; retain their source times (the drawer's source-timing block).
- **Alert delivery.** GitHub Actions health monitoring works but GitHub may
  delay or drop scheduled runs; it is not a guaranteed ten-minute channel.
- Until step 6 lands: the Dune key remains fragile (banned account — do not
  rotate or revoke) and the query remains externally owned.

## Operational reminders

Operational guardrails live in [AGENTS.md](AGENTS.md)'s Guardrails section and
are authoritative there; this file does not restate them.
