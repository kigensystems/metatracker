# meta.tracker — Plan

Forward-looking plan and active risks. Past incidents and rollout notes are in
[docs/HISTORY.md](docs/HISTORY.md). Architecture and operating instructions are
in [README.md](README.md) and [AGENTS.md](AGENTS.md). The authoritative pipeline
audit and next-session starting point are in
[docs/HANDOFF-2026-07-27.md](docs/HANDOFF-2026-07-27.md).

## Purpose

meta.tracker is a personal research dashboard for quickly answering:

1. What tokens are people bidding right now?
2. What appears to be the current meta?
3. What launched recently and performed well, even if it already died?
4. Which token is worth opening so I can investigate why it worked?

This is not a general analytics product. It does not need onboarding, an opaque
scoring system, automatic narrative classification, or perfect all-time market
history. The interface should make the important tokens obvious and make it
easy to open DexScreener, Pump.fun, socials, and the token website for research.

The target cohort is the intersection of tokens that graduated and tokens that
reached a defensible peak market cap of roughly `$100k+`. The finished dashboard
does not need to display every graduate. Until the data source can reliably
recover observed peaks, the current broader feed is only a transitional proxy;
it must not silently exclude a qualifying runner merely because the token died
before a later snapshot.

## What the current app actually receives

### Dune: which tokens enter the dashboard

The live third-party query is
[`4124453`](https://dune.com/queries/4124453), owned by `adam_tehc`. It:

- finds Pump.fun migrations from the preceding 24 hours;
- finds qualifying DEX trades involving those tokens;
- estimates market cap from the seven most recent trades;
- filters out tokens with fewer than 100 counted trades; and
- returns mint, symbol, estimated market cap, trade count, and price.

Important limitations:

- The app fetches the query's latest completed result; it does not cause the
  query to execute. A new app sync can therefore receive an old token list.
- The returned market cap is a current estimate at the Dune execution time, not
  the token's peak.
- The existing trade-count calculation likely describes token buys rather than
  all buys and sells. It needs clearer SQL and naming before we rely on it as a
  bidding signal.
- Dune knows the Pump.fun migration time but the current result does not return
  it.

The backfill query is [`7746626`](https://dune.com/queries/7746626). It accepts a
historical window but otherwise uses similar logic.

### DexScreener: what the token looks like now

For every Dune mint, the app selects the Solana pair with the highest reported
liquidity and receives:

- token name, image, banner, website, and socials;
- current pair volume, liquidity, price change, market cap, and price; and
- pair creation time.

These metrics are useful for seeing what is active now. DexScreener does not
provide the historical peak market cap through its documented API, and its
24-hour volume is for the selected pair rather than necessarily every pool.

### Storage

The app currently overwrites one snapshot per UTC day on each two-hour sync.
That is enough for the latest state but can erase evidence that a token ran and
collapsed earlier in the day.

## The useful signals

Avoid inventing one complicated “meta score.” Show understandable measurements
and let the table be sorted quickly.

### What people are bidding now

- recent USD volume;
- buy and sell counts or volume, once the Dune SQL is corrected;
- current liquidity;
- recent price change;
- current market cap; and
- time since graduation.

### What performed well recently

- best defensible market cap observed after graduation;
- current market cap beside the peak;
- percentage below peak, which makes dead runners visible;
- total volume over the measured period; and
- peak time or time-to-peak when available.

The preferred peak is calculated from short trade buckets using a VWAP or
median, not the largest price from one tiny trade. If Dune cannot produce a
credible peak, show volume as the fallback and label it as volume. Do not invent
an all-time high.

For this tool, a peak within the recent monitored window is sufficient. Start
with the same approximately 24-hour post-migration window used for discovery.
Only add a longer monitoring window or another OHLCV provider if real examples
show that the 24-hour result regularly misses useful runners.

## Target interface

Use one dense token table with simple sort presets instead of multiple complex
dashboards:

- **Trending** — sorts by recent USD volume and shows buy/sell activity,
  liquidity, and recency beside it. No hidden composite score.
- **Best runners** — sorts by observed peak, falling back to volume.
- **Newest** — shows the latest graduates first.

Suggested desktop columns:

`Token | Peak MC | Current MC | Volume | Buys/Sells | Liquidity | Change | Age`

The token name, image, and symbol should remain prominent because recognizing
common names, characters, themes, and presentation is part of judging the meta.
Dead runners must remain in Best runners even when their current values are
poor.

Clicking a token should provide the details needed to investigate it:

- peak/current performance and when it happened;
- image, banner, description, and socials when available;
- mint address; and
- direct links to DexScreener, Pump.fun, website, and social profiles.

On mobile, keep token identity, the selected sort metric, volume, and age
visible; move secondary measurements into the detail drawer.

Freshness should be one quiet “updated” indicator. Technical source timestamps
can remain available in the drawer or tooltip without dominating the page.

## Preservation contract

The current production iteration must keep working throughout implementation.
Treat the existing Convex documents, `/api/*` responses, historical snapshots,
and React table as a compatibility contract.

- Do not rename, remove, or change the meaning of existing token fields during
  this work. Add new Convex fields as optional so old documents remain valid.
- Keep the existing `tokens`, `totalCount`, freshness fields, and current token
  properties in `/api/graduated`. New properties must be additive and nullable.
- Keep `/api/graduated` live and historical modes, `/api/available-dates`, and
  `/api/health` working with their current response shapes.
- Historical snapshots will not contain the new measurements. The API and UI
  must render those records using the current market-cap/volume fields rather
  than failing or showing misleading peak labels.
- Deploy in dependency order: optional Convex schema/read support first,
  Functions parsing/API support second, and frontend consumption last. The old
  frontend must work against the new backend, and the new frontend must work
  when every new field is absent.
- Do not switch production to a new Dune query immediately. Run it in shadow,
  compare its token set and existing fields with query `4124453`, and keep the
  old query available as the rollback path.
- Preserve the current empty-result, partial-result, malformed-row, historical-
  overwrite, and token-retention guards in `storeSnapshot` and token sync.
- Do not combine the data-source switch, database changes, and full frontend
  redesign in one deployment. Each stage must be independently deployable and
  reversible.

### Required regression coverage before production changes

- [x] Add fixtures for the current Dune row format and the proposed extended
      format; both must parse successfully during the transition.
- [x] Add an API contract test proving the existing token/freshness response is
      unchanged when new fields are absent and only extended when present.
- [x] Add a storage compatibility check using old token documents and new
      optional fields, including replacement/retention guard behavior.
- [x] Add frontend fixture coverage for current live data, an old historical
      snapshot, partially enriched data, and the new extended data.
- [x] Record a production baseline response shape and representative screenshots
      without storing credentials or high-volume provider responses.

## Next implementation session

### 1. Lock the current behavior before changing it

- [x] Add the regression fixtures and contract checks above.
- [x] Record the current API fields and frontend states as the comparison
      baseline.
- [x] Confirm the current test/build commands pass before and after every stage.

### 2. Prove the small data improvement in shadow

- [ ] Recreate the Dune query under an account/team we control and version its
      SQL in the repository.
- [ ] Return the real migration time, clearly defined buy/sell counts, USD
      volume, and a robust peak market-cap estimate for the recent window.
- [ ] Compare the peak result against a small set of known runners, dead tokens,
      and obvious outliers on external charts.
- [ ] Confirm the query is executing frequently enough for a fast market; do not
      mistake repeatedly downloading an old result for fresh data.

Success means the query finds the tokens we care about, captures brief runners,
and does not let one tiny trade manufacture the top result.

### 3. Add optional backend support without switching the UI

- [x] Add only the fields needed by the table: graduation time, observed peak,
      peak time, current market cap, measured volume, buy/sell counts, and source
      timestamps.
- [ ] Keep a token's highest valid observed peak instead of overwriting it when
      the token falls.
- [ ] Store current DexScreener data separately from Dune's measured-window
      values so the interface does not imply they are from the same moment.
- [ ] Validate the selected Dex pair and retain its address for outbound links.
- [ ] Deploy optional Convex fields first, then Functions support. Verify the
      unchanged production frontend before proceeding.

Do not build complete tick history, long-term chart infrastructure, or paid
provider integration in this pass.

### 4. Simplify the frontend with fallbacks

- [ ] Replace redundant summary cards with the sortable token table and the
      Trending, Best runners, and Newest presets.
- [ ] Make peak versus current state immediately legible.
- [ ] Keep dead runners in the results.
- [ ] Improve the detail drawer as the place to investigate why a token worked.
- [ ] Keep existing content visible while changing date windows.
- [ ] Simplify freshness messaging and add a reasonable live-cache refresh.
- [ ] Verify the result visually on desktop and mobile using real data.
- [ ] If new peak/bidding fields are missing, retain the current volume and
      market-cap presentation instead of erroring or producing empty rankings.

### 5. Switch data sources only after comparison

- [ ] Compare shadow and current query results across several executions.
- [ ] Switch the query identifier independently of the schema/UI deployments.
- [ ] Verify `/api/health`, live and historical API responses, a representative
      token drawer, and Netlify's two-hour schedule immediately after deploy.
- [ ] Keep the prior query/configuration available for immediate rollback.

### 6. Add more only when the simple version proves a need

Possible later additions:

- a longer peak-monitoring window;
- GeckoTerminal or Birdeye OHLCV when Dune cannot recover a useful peak;
- token search and a local watchlist;
- a compact performance chart; or
- manual notes/tags for patterns worth remembering.

## Reliability work that should not derail the product change

- [ ] Gate public invocation of `/api/scheduled-sync` without breaking Netlify
      scheduled invocations. Netlify's non-public scheduled functions have a
      30-second limit, while this enrichment job needs the 15-minute background
      runtime; use a scheduled dispatcher plus an authenticated background
      worker rather than trusting a spoofable request body.
- [x] Prevent an older or concurrent Dune result from replacing newer data.
- [x] Validate external URLs and use `noopener,noreferrer` when opening them.
- [x] Fix the undefined `neon-*` loading/error color classes.
- [x] Keep focused regression tests around snapshot and sync bookkeeping.

## Active risks

- **Dune ownership and freshness.** The live query is externally controlled and
  may change, stop, or return an old execution independently of this app.
- **Dune credentials.** The existing key reportedly belongs to a banned account
  and appeared in git history. Do not print, rotate, or revoke it until a tested
  replacement exists.
- **Peak manipulation.** Never use a raw single-trade maximum as the winner
  metric.
- **Mixed timestamps.** Dune and DexScreener values can describe different
  moments; retain their source times.
- **Historical backfills.** A historical Dune cohort enriched later receives
  current DexScreener values, not a historically accurate Dex reconstruction.
- **Alert delivery.** GitHub Actions is configured six times per hour and has
  successfully opened/closed health issues, but GitHub may delay or drop
  scheduled runs. It is not a guaranteed ten-minute or direct-message channel.

## Operational reminders

- Only scheduled sync and admin backfill write durable snapshots; live/manual
  fetches must not advance `duneMetadata` without a matching durable write.
- Start every backfill with `dryRun=true`.
- After a Netlify deploy touching functions, verify `scheduled-sync` is still
  registered with `0 */2 * * *`.
- Production reads Convex `dusty-ox-307`; follow the documented
  `convex dev --once` path when intentionally updating that deployment.
- Use `syncRuns` and `/api/health` as the operational health source.
