# Handoff — pump.fun migration + UI rebuild (2026-07-28)

Branch: `claude/site-ux-improvements-4f5eeb` (worktree `site-ux-improvements-4f5eeb`).
Nothing in here is deployed. Production is untouched and still runs the old path.

Supersedes nothing — [HANDOFF-2026-07-28.md](HANDOFF-2026-07-28.md) covers the
prior observed-peak work and is still accurate for what is live today.

---

## TL;DR

The Dune query the product is built on is **missing ~95% of graduations**, and
its market cap is a spot estimate from at most 7 trades. pump.fun's own API
returns the entire graduated cohort, 100% art, live market cap, and an
**all-time-high market cap** that matches Solana Tracker to 0.3% — instantly,
free, with no key.

**Blocker:** pump.fun's feed includes wash-pumped tokens that Dune's trade
filter was incidentally excluding. 21 of the 22 highest ATHs in a real cohort
are fabricated. A liquidity-ratio filter separates them cleanly — see
[MUST FIX BEFORE SHIPPING](#must-fix-before-shipping--fake-aths).

The migration is written and verified end-to-end against live APIs through a
local fixture. It is **not wired into the sync functions** and **not deployed**.

---

## The core finding

Query `4124453` ([token-sync.ts:143](../netlify/functions/_shared/token-sync.ts))
belongs to `@adam_tehc`, is hardcoded with no env override, and was last updated
25 days before this session. It detects graduation by matching a single
hardcoded instruction discriminator:

```sql
WHERE executing_account = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
  AND bytearray_substring(data, 1, 8) = 0x9beae792ec9ea21e
```

That is the legacy migration path. pump.fun now migrates to **PumpSwap**
(visible as `pump_swap_pool` in their API response). Graduations taking the
newer path are invisible to the query — silently, with no error.

**Measured, twice, independently:**

| | count in a 24h window |
|---|---|
| Dune query `4124453` | **52** |
| pump.fun `complete=true` feed | **998–999** |

There is no market cap, volume, or liquidity floor anywhere in that SQL — live
results go down to $2,397 — so this is not the query being selective. It is
blind to most graduations.

**Its market cap is also unreliable.** It derives price from `amount_usd /
token_amount` over `rn <= 7` — at most seven recent trades. For an illiquid
token that is noise. This is why the live site shows Kitty Coin at *$8.7K
market cap next to $882.1K of 24h volume*.

---

## What pump.fun actually provides

Base: `https://frontend-api-v3.pump.fun`. No key, no account, no credits.
Returns 200 with no auth header, and even with the User-Agent stripped.

**Community docs put `/coins/{mint}` at ~20 RPM. A burst of 65 in one minute
drew no 429, so the ceiling is soft — but treat 20 RPM as the planning number.**
At ~999 graduates/day the whole cohort is ~2% of that budget.

### Endpoints that work (verified this session)

| endpoint | notes |
|---|---|
| `GET /coins?complete=true&sort=created_timestamp&order=DESC&limit=50&offset=N&includeNsfw=true` | **the graduated feed.** Returns full coin objects, so no second call is needed for metadata |
| `GET /coins/{mint}` | single coin, same shape |
| `GET /coins/currently-live` | live coins |
| `GET /coins/similar?mint=` | responds 200 but returned empty; unverified |

### Endpoints in the spec that are DEAD (all 404 as of 2026-07-28)

`/metas/current`, `/metas/search`, `/candlesticks/{mint}`,
`/coins/featured/{timeWindow}`, `/coins/king-of-the-hill`, `/coins/latest`,
`/coins/search`, `/coins/graduated`, `/replies/{mint}`, all five `/trades/*`,
`/coins/user-created-coins/{userId}`.

> [BankkRoll/pumpfun-apis](https://github.com/BankkRoll/pumpfun-apis) documents
> 146 v3 paths but is a **2026-06-17 snapshot** — roughly 95% of it now 404s.
> Do not trust it without probing. Note also that v1 and v2 are already
> deprecated, so v3 will not last forever either.
>
> The two most valuable dead ones are worth re-probing occasionally:
> `/metas/current` (pump.fun's own trending-meta list) and `/candlesticks/{mint}`.

### Fields on a coin object (49 total; the ones that matter)

| field | verified behaviour |
|---|---|
| `ath_market_cap` | **all-time-high market cap, USD.** TRUMPFOLIO: `$8,936,981` vs Solana Tracker's `$8.91M` — **0.3% match**. 50/50 coverage |
| `ath_market_cap_timestamp` | when it peaked — enables time-to-peak, which the product has never had |
| `usd_market_cap` | **live and accurate.** Within ~1% of DexScreener across RETCATE, GIGACCOON, SMOLE. Still reports tokens DexScreener has delisted |
| `image_uri` | **100% coverage** vs DexScreener's 35% |
| `website` | ~25% on minutes-old tokens, ~76% on a mature cohort. Often the TikTok/IG/X post the meme came from |
| `twitter`, `telegram` | better coverage than DexScreener |
| `created_timestamp` | true creation time; beats DexScreener's `pairCreatedAt` |
| `reply_count` | comment volume — a free social signal, currently unused |
| `creator` | deployer wallet, currently unused |
| `banner_uri` | only 3/50 — DexScreener's `info.header` is still better |
| `market_cap` | SOL-denominated. Use `usd_market_cap` instead |

**Correction to an earlier claim in this session:** `usd_market_cap` was
initially dismissed as a frozen bonding-curve value. That was wrong — it was
judged against Dune's already-discredited number. It is accurate and live.

### DexScreener is still required

Scanned all 49 fields for `volume|liquid|price|change|holder` → **none**.
DexScreener remains the only source for **24h volume, liquidity, and 24h price
change**. Its role shrinks to supporting evidence; it is no longer load-bearing.

---

## Division of labour after this migration

| job | source |
|---|---|
| which tokens graduated | pump.fun `/coins?complete=true` |
| art, website, X, Telegram | pump.fun (DexScreener as fallback for art) |
| live market cap | **pump.fun primary**, DexScreener fallback |
| ATH / observed peak + peak time | pump.fun `ath_market_cap` |
| 24h volume, liquidity, 24h change | DexScreener — only source |
| ~~discovery~~, ~~market cap~~ | ~~Dune~~ — drops out |
| ~~observed peak~~ | ~~Solana Tracker~~ — becomes redundant |

---

## What is implemented (and verified)

### Backend — [token-sync.ts](../netlify/functions/_shared/token-sync.ts)

- `fetchGraduatedFromPumpFun(windowMs, now)` — paginated graduated feed,
  returns `{ tokens, meta, createdAt, pagesFetched }`. 3 calls / 2.5s for 3h of
  graduates.
- `pumpMetaFromCoin()` — shared parser. Strips bare `https://` values, which
  creators leave surprisingly often.
- `enrichTokens(tokens, options)` — takes `{ pumpMeta, createdAt }`. pump.fun
  metadata comes **only** from the prefetched graduated feed; there is
  deliberately no per-mint fallback. An earlier revision had one, which added
  ~1s per token to the synchronous `graduated.ts` endpoint and would have blown
  its function timeout. Until step 1 wires discovery, `pumpMeta` is empty and
  enrichment behaves exactly as it does today.
- Returns `peakObservations: PeakObservation[]` shaped for
  `observedPeaks.record`. Written to that table rather than onto token rows, so
  the schema's "peaks never live on token rows" invariant holds. `record`
  already keeps the larger of two readings, so a rising ATH updates for free.
- Market cap priority is now `pump ?? dune ?? dex`, so dead runners
  (DexScreener has dropped their pair) still show a number.

### Frontend

Palette rebuilt to **light/paper** (`#FAFAF8` ground, `#16181C` ink, accents at
≥4.5:1). IBM Plex Sans + Mono actually loaded — `--font-sans: Inter` had been
declared but never fetched, so it was silently rendering in system-ui.

- `ControlBar.tsx` (new) — snapshot tabs + `Cleared $100K` filter in one row.
- `NextRuns.tsx` (new) — live countdowns to the next Dune sync (`0 */2 * * *`)
  and peak read (`20 * * * *`), UTC maths unit-checked against midnight
  rollover and exact boundaries. In the app bar ≥`md`, on the status line below.
- `RowActions.tsx` + `lib/token-links.ts` (new) — `Website · DexScreener · X`
  as plain links under each name. `pump.fun` and `dexscreener.com` are filtered
  out of the Website slot (they have their own affordance); TikTok/IG/X are
  **kept**, since they are usually the meme's origin.
- `PeakCell.tsx` (new) — peak, or `after 24h` when the token is too young.
- `lib/peak.ts` (new) — `hasClearedPeak()` also counts live market cap over the
  bar; a token trading at $741K has self-evidently been worth $741K.
- Row: art at 56px (was 36px), sortable **Age** column, mint tag disambiguating
  repeated tickers, sticky table header.
- `Dune MC` relabelled `Market cap` — once discovery moved it was silently
  DexScreener's figure under Dune's name.
- Favicon and header logo removed at owner's request.

### Verification evidence

> **Warning about the numbers below:** this run fired 995 DexScreener requests
> in 72s (~14/sec against a ~5/sec limit), so most `volume24h` and `liquidity`
> values came back empty. Art / market cap / ATH (all pump.fun) are unaffected.
> **Pace DexScreener at <= 5 req/sec before trusting any volume or liquidity
> figure from a bulk run.**

Full pipeline against live APIs, **full 24h cohort**, 72 seconds end to end:

```
graduated in 24h: 995 | rendered: 995
art        995/995 (100%)
market cap 995/995 (100%)
ATH (peak) 995/995 (100%)
peak time  995/995 (100%)
cleared $100k: 318
```

318 of 995 cleared the $100K bar in one day. Today's live site shows ~44
tokens/day total.

`npm run build` ✓ · `npm run typecheck:functions` ✓ · `npm run test:health` 40/40 ✓

---

## NOT done — next steps, in order

0. **Implement the fake-ATH filter** (see the section below). This is a
   correctness blocker, not a polish item — without it the top of the list is
   almost entirely fabricated peaks, which is worse than the Dune undercount it
   replaces.
1. **Wire discovery into the sync.** `scheduled-sync.ts` and `graduated.ts`
   still call Dune. Swap in `fetchGraduatedFromPumpFun`, pass `pumpMeta` /
   `createdAt` into `enrichTokens`, and persist `peakObservations` via
   `api.observedPeaks.record`.
2. **Probe pump.fun from Netlify before trusting any of this in production.**
   Every measurement here ran from a residential IP. The endpoint is
   Cloudflare-fronted and datacenter egress is often treated differently. A
   preview deploy settles it; it is non-destructive.
3. **Size the 999/day cohort.** That is ~19x today's ~44/day. Affects Convex
   write volume and storage, DexScreener calls per sync, and snapshot row
   counts. **Decide whether to ingest all graduates or apply a floor** (e.g.
   only enrich tokens whose ATH cleared some threshold — ATH is known *before*
   any DexScreener call, which makes this cheap).
4. **Retire Solana Tracker and `peak-backfill`** once ATH is live. Removes an
   API key, an hourly cron, the 150-mints-per-run ceiling, the 24h
   `MIN_TOKEN_AGE_MS` gate, and the `observedPeaks` pending-queue logic.
   Keep the table itself — it is where ATH now lands.
5. **Revisit peak copy.** `after 24h`, "observed peak", and the "not ATH until
   proven" language in AGENTS.md all exist because a true ATH was unavailable.
   pump.fun reports one directly from token creation, so the honesty caveat can
   be relaxed — deliberately, not by accident.
6. **Revisit `src/lib/peak.ts`'s 24h heuristic — it becomes WRONG once ATH is
   wired.** `peakState()` returns `scheduled` ("after 24h") for any token under
   a day old, mirroring `MIN_TOKEN_AGE_MS` in `peak-backfill.ts`. With pump.fun
   ATH the reading exists immediately, so that branch would hide a real number
   behind a placeholder. Delete the `scheduled` state at the same time as
   step 1, not after.
7. **Consider `reply_count` and `creator`** — both free, both unused. Owner has
   said creator/launch-farm data is *not* of interest; `reply_count` as a
   social-engagement signal has not been discussed.

---

## MUST FIX BEFORE SHIPPING — fake ATHs

Dune's `amount_usd >= 1` trade requirement was incidentally filtering these out.
pump.fun's feed has no such filter, so they now dominate the top of the list.

**The failure mode.** A token's market cap is price x supply. On a PumpSwap pool
holding ~$1,300, a few hundred dollars of self-buying moves price enough to
print a nine-figure "market cap". `ath_market_cap` records it faithfully. The
chart is a perfectly smooth monotonic staircase to $172M followed by an instant
vertical collapse to ~$1,300 — one wallet buying its own curve.

Worked example, `J2H2gkSWdsCqNLNHszjVskPQndpVQsiJL22aYMdpump` ($USWR):

| | |
|---|---|
| pump.fun `ath_market_cap` | **$172,416,641** |
| DexScreener liquidity | **$1,373** |
| DexScreener current market cap | $1,316 |
| 24h volume | $4,301,123 (wash) |

### The signal: ATH / liquidity

Measured on the 22 highest-ATH tokens in a full 24h cohort:

```
                       liquidity        ATH            ATH/liq
21 tokens (fake)     $1,243–$3,639   $42M–$172M     22,568 – 125,555
$USOX    (real)       $484,109        $45.2M                    93
```

**A 240x gap with nothing in it.** Any threshold between ~200 and ~20,000
separates them cleanly; **~1,000 sits safely in the middle**. Every fake was
`$USWR`/`$TNOS`/`$USOH`/`$USOP`/`$USOX`/`$CATE` — the oil-parody cluster — with
liquidity pinned around $1,300 regardless of claimed peak, which is itself the
tell.

### Recommended implementation

1. **Capture liquidity at first sight and store it.** Tokens are now captured
   within minutes of graduating, so recorded liquidity is near-peak liquidity.
   A real runner that later dies keeps its captured value, so this does **not**
   erase dead runners — which the product mission explicitly requires.
2. **Reject the ATH when `athMarketCap / liquidityAtCapture > ~1000`.** Prefer
   suppressing the *peak* over hiding the token, so nothing silently vanishes.
3. A simpler v1 that also separates this dataset: require **liquidity >= ~$10k**
   at capture for a `$100k+` claim to be trusted ($484,109 vs ~$1,300).
4. Cross-check available for free: DexScreener's own `marketCap` for these reads
   ~$1,316. DexScreener never believed the $172M either.

**Caveat:** liquidity is a *current* reading, so applying this filter
retroactively to already-dead tokens will misclassify real runners. It must be
evaluated at capture time and the verdict frozen.

---

## Open risks

- **Undocumented dependency.** No official ToS, no SLA, no rate-limit headers.
  pump.fun removed ~95% of their public frontend endpoints in ~6 weeks. Keep
  the DexScreener fallback so failure degrades to today's behaviour rather than
  breaking. Convex remains the durable asset: once captured, a token's art and
  links survive whatever pump.fun does next.
- **Unverified from Netlify** (step 2 above).
- **ATH on Raydium-migrated tokens** is unconfirmed. TRUMPFOLIO is on PumpSwap
  and tracks correctly far above the ~$69K graduation threshold. Spot-check a
  Raydium one before retiring Solana Tracker.
- **`ROW_GRID` column sync is hand-maintained.** `TokenRow.tsx` owns the grid
  template; `TokenList.tsx` renders a header that must produce a matching cell
  count at every breakpoint via `display: none`. This session both added a
  column (Age) and removed two (mobile chevron, links). A mismatch misaligns
  values under headers silently — no compiler or test catches it. Worth a
  single column-definition array if the table changes much more.
- **Fresh-token link coverage is low** (~25% website on minutes-old tokens vs
  ~76% on a mature cohort) because creators fill links in later. Re-enriching
  on later syncs would improve this.

---

## Reproducing the local verification loop

No deploy, no Convex writes, real API data.

```bash
npx tsc --target ES2022 --module NodeNext --moduleResolution NodeNext \
  --strict --skipLibCheck --outDir /tmp/out \
  netlify/functions/_shared/token-sync.ts \
  netlify/functions/_shared/retry.ts \
  netlify/functions/_shared/api-contract.ts
```

Then a script that calls `fetchGraduatedFromPumpFun` → `enrichTokens` →
`withObservedPeaks` → `toApiToken`, writes the result as a
`/api/graduated`-shaped JSON, and serves it on `:8899`. Point the UI at it:

```bash
VITE_API_BASE="http://localhost:8899" npx vite --port 5173
```

Two gotchas that cost time:

- **Node's `fetch` fails DNS under the tool sandbox** while `curl` succeeds.
  Run these with the sandbox disabled.
- The fixture server reads its JSON **once at boot** — restart it after
  regenerating, or you will screenshot stale data and think the code is broken.

### Why only a `Latest` tab appears against the fixture

`DatePicker` is untouched and still rendered from
[ControlBar.tsx:58](../src/components/ControlBar.tsx). Date tabs are driven by
`/available-dates`, which lists **stored Convex snapshots** — production has 30,
the fixture has none, so only `Latest` shows.

This is also the accurate steady state for the new pipeline *today*: per-day
tabs repopulate one day at a time once the new sync starts writing snapshots.
Point `VITE_API_BASE` back at `https://metratrackerapp.netlify.app/api` to see
the real tabs against live (old-pipeline) data.
