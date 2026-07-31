# Open items

Things deliberately left unresolved, with enough context to pick them up cold.
Opened 2026-07-30 when the pump.fun pipeline was committed.

This is **not** the deploy checklist — that lives in [PLAN.md](../PLAN.md), and
so does the post-deploy retirement of the Dune and Solana Tracker code. Nothing
here blocks the push.

---

## 1. Data questions

### 1.1 What does `ath_market_cap` actually cover? (highest value)

Measured 2026-07-30 over a full 24h sample of the `complete=true` feed (850
coins):

| `ath_market_cap` | share |
| --- | --- |
| $1k – $10k | 22.1% |
| $10k – $69k | 35.6% |
| $69k – $100k | 5.6% |
| above $100k | 36.6% |

843 of the 850 have a `pump_swap_pool`, meaning they demonstrably migrated. So
**at least 484 coins graduated yet report an all-time high below the
bonding-curve graduation threshold**, which is self-contradictory.

Two candidate explanations, untested:

1. `ath_market_cap` only tracks the **post-migration PumpSwap phase**, missing
   the bonding-curve peak that caused the graduation. If so the field
   systematically under-reports for tokens that graduated and immediately dumped.
2. The threshold is denominated in **SOL**, not USD, so its dollar value floats.
   This cannot explain a $3.5k tenth-percentile on its own, but it widens the
   band.

**Why it matters:** the `$100k` qualification bar and every "N of M graduates"
denominator are read off this field. Under-reporting would hide real runners.
It does not affect the top of the distribution — a previous session matched
pump.fun's ATH to a Solana Tracker reading within 0.3% on TRUMPFOLIO ($8.94M vs
$8.91M), so the field is trustworthy where the numbers are large.

**How to settle it:** take ~20 coins with sub-$69k reported ATH and a live
`pump_swap_pool`, pull their actual price history from a second source, and see
whether the real peak exceeds the reported one. If it does, the fix is either a
supplementary peak read for low-ATH rows or a documented caveat on the label.

### 1.2 The discovery window is creation time, not graduation time

`fetchGraduatedFromPumpFun` pages `sort=created_timestamp` and stops at a 24h
cutoff, so the cohort is *"coins created in the last 24h that have graduated"* —
**not** *"coins that graduated in the last 24h."* A coin created three days ago
that graduates today is never seen.

This is structural, not a bug: the coin object carries no graduation timestamp
(every key was checked). The one graduation-ordered endpoint,
`/coins/graduated` on `advanced-api-v2`, only reaches ~1.9h back, which is why
it was not used. Unknown what fraction of graduations are slow enough to be
missed — worth measuring before treating the cohort as complete.

---

## 2. Verify on the first production run

The write path has **never been executed** — not locally, not against Convex.
Local verification exercised the engine (`fetchGraduatedFromPumpFun` +
`enrichTokens`) and the read path, but never `scheduled-sync`'s handler, its
Convex writes, its `syncRuns` audit row, or its peak recording.

Check after the first cron fires:

- `/api/health` returns `ok: true` with a sane `feedAgeMinutes`.
- The `syncRuns` row shows `status: success` and a token count in the hundreds.
- **`storeSnapshot` survived the cohort size.** It inserts every incoming token
  in one Convex transaction — ~850 inserts plus deletes, against ~50 before.
  Within documented Convex write limits, but never exercised at this scale. A
  failure here is loud (the mutation throws, the run is marked failed, the
  previous snapshot stands).
- Art and links populated on new rows; peaks labelled `ATH market cap` in the
  drawer, older rows still `Observed peak MC`.

**Response payload grew ~20x.** Measured 1,231 bytes/token, so ~1 MB at 850
tokens and ~3.5 MB if a day's union reaches 3,000. Netlify's limit is 6 MB —
fine now, but the daily union grows through the UTC day, so watch it.

`observedPeaks.byMints` was tested at scale against production and is fine:
3,000 mints in ~1s.

---

## 3. Not visually verified

Local UI verification ran against a fixture with no stored history, so these
never rendered:

- `DatePicker`'s date tabs (only the "Latest" tab ever appeared).
- `LoadingScreen`, and `EmptyState`'s error variant.

These are all from the earlier paper-palette rebuild, which was already
uncommitted when the migration work started. They typecheck and build; they have
simply not been looked at in a browser this session.

---

## 4. Code quality, deferred

Found by `/simplify`, none of them defects:

- **`src/lib/format.ts`** — `formatAge` and `formatRelativeTime` duplicate the
  same mins→hours→days bucketing. They have already diverged on the negative-diff
  edge case (`'—'` vs `'Just now'`). Extract the shared bucketing.
- **`src/App.tsx`** — `summary` makes three full passes over the cohort to find
  three maxes; one pass would do. Separately, `qualifiedCount` and
  `filteredTokens` both run `hasClearedPeak` over the full list. At 1,700 rows
  this is a few thousand cheap comparisons behind a correct `useMemo`, so it is
  a tidiness item, not a performance problem.
- **`DuneGraduatedToken`** is still the input type for `enrichTokens`, with
  `marketCap: 0, tradeCount: 0, vwapPrice: 0` stuffed in as placeholders for
  pump.fun rows. Harmless today only because every consumer treats them as
  falsy — a future `if (token.marketCap)` would silently zero live data. Narrow
  the type at the `enrichTokens` boundary during the scheduled cleanup.

---

## 5. Latent risk to remember

`peak-backfill` still runs hourly against Solana Tracker. It stays cheap only
because pump.fun now writes a peak row for essentially every token, so
`observedPeaks.pending` skips them. **If pump.fun ever stops returning
`ath_market_cap`, every new mint becomes pending** and the job would quietly
start burning Solana Tracker quota at ~20x the rate it was designed for
(capacity is 150/run hourly against a 2,500/month free plan). Retiring
`peak-backfill` after the deploy removes this entirely — see PLAN.md.
