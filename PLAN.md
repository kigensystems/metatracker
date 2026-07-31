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

**Deployed and verified in production on 2026-07-31.** Convex `dusty-ox-307`
and Netlify are both on commit `8bc125a`, with both crons registered.

`scheduled-sync` discovers through pump.fun `/coins?complete=true`, enriches
through DexScreener at 5 requests in flight per second, stores the snapshot with
the capture time as its source timestamp, and records each reported ATH into
`observedPeaks` in batches of 50. `/api/graduated` is a pure Convex reader — the
live-fetch, force-refresh and Dune freshness-comparison paths are gone. Health's
second staleness tier measures feed freshness (the newest creation time the feed
offered) instead of a Dune execution age.

The first production run:

```
809 graduated tokens from 17 pages | 100% DexScreener enrichment
809/809 reported ATHs recorded     | 818 stored (9 Dune-era rows preserved)
211.9s total, retryCount 0         | /api/health ok, feedAgeMinutes 9
```

The dashboard went from 23 tokens and 4 clearing `$100k` to **818 and 298**.
Payload is ~1.0 MB served in ~1.5s. `storeSnapshot` handled an 809-token
transaction — 20x anything it had done before — and `observedPeaks.byMints`
was separately measured at 3,000 mints in ~1s.

Still on Dune: `POST /api/backfill` only. `peak-backfill` + Solana Tracker still
run and still own the peaks for the 6 pre-migration rows that carry one.

## What remains

Open questions and deferred cleanups live in
[docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md) — read it before assuming the pump.fun
data is fully understood.

### 1. Confirm pump.fun answers a Netlify IP — do this first

**This is the one thing the deploy did not prove.** The pre-flight probe was
skipped by the owner's decision, and the first production snapshot was written
by running the real handler locally, from a residential IP. pump.fun is
Cloudflare-fronted and may treat datacenter egress differently, so **no
successful fetch has ever been made from Netlify.**

Check the first *scheduled* run (any even UTC hour):

```bash
curl -s https://metratrackerapp.netlify.app/api/health | python3 -m json.tool
```

A `syncRuns` row with `status: success` and a token count in the hundreds means
the transport is fine and this item closes. An empty feed is the signature of
blocked egress — the sync refuses to store an empty cohort, so the failure is
loud, the previous snapshot survives, and health goes red within ~4.5h with the
GitHub monitor opening an issue. The fix would then be a different transport
(proxy or a server-side fetch with browser-ish headers), not a data change.

### 2. Retire what the migration obsoletes (only after step 1 is confirmed)

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

### Running a real Netlify function without deploying

The fixture loop above never executes the handlers themselves, which is how the
write path stayed unproven right up to deploy day. To run one for real, compile
it to CommonJS **inside the project** so `node_modules` resolves, copy in the
generated Convex client, and call the exported handler:

```bash
npx tsc --target ES2022 --module CommonJS --moduleResolution node --strict \
  --skipLibCheck --esModuleInterop --outDir node_modules/.cache/fn-run \
  netlify/functions/scheduled-sync.ts
mkdir -p node_modules/.cache/fn-run/convex
cp -R convex/_generated node_modules/.cache/fn-run/convex/_generated
```

Then a driver that sets `process.env.CONVEX_URL` (the value of `VITE_CONVEX_URL`
in `.env.local`; it is public, it ships in the client bundle) and awaits
`require('./netlify/functions/scheduled-sync.js').default(new Request('http://local'), {})`.

`tsc` emits despite the `Cannot find name 'process'` error — that is expected
without `@types/node` and does not block the run. Delete the cache directory
afterwards. **This writes to whichever Convex deployment `CONVEX_URL` points
at**, so it is a real production write when pointed at `dusty-ox-307` — which is
exactly how the first pump.fun snapshot was captured, and it proved the
809-token `storeSnapshot` transaction that no local fixture could.

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

- [x] ~~Gate public invocation of `/api/scheduled-sync`.~~ Closed 2026-07-31:
      `POST /api/scheduled-sync` returns **403** in production. Netlify already
      blocks external invocation of scheduled functions while still granting
      them the 15-minute background runtime, so the dispatcher-plus-worker
      design this item proposed is unnecessary. To run one on demand, execute
      the handler locally against `CONVEX_URL` — see the verification loop.

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
