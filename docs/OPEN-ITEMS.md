# Open items

Things deliberately left unresolved, with enough context to pick them up cold.
Opened 2026-07-30 when the pump.fun pipeline was committed; pruned 2026-07-31
after the first production run settled several of them.

This is **not** the deploy checklist — that lives in [PLAN.md](../PLAN.md), and
so does the post-deploy retirement of the Dune and Solana Tracker code.

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

## 2. Settled by the first production run (2026-07-31)

Kept as a record so nobody re-opens them:

- **`scheduled-sync`'s write path works.** 809 tokens, 17 pages, 100%
  DexScreener enrichment, 809/809 peaks recorded, 211.9s, `retryCount: 0`.
- **`storeSnapshot` survives cohort scale** — an 809-token Convex transaction,
  20x anything it had done before. The union preserved 9 Dune-era rows that
  dropped out of the window, so 818 were stored and nothing was lost.
- **`observedPeaks.byMints` scales** — measured at 3,000 mints in ~1s.
- **Payload growth is fine** — 818 tokens served as ~1.0 MB in ~1.5s, against
  Netlify's 6 MB limit. Roughly 1,245 bytes/token, so the ceiling is ~4,800
  tokens. Worth re-checking if the daily union ever approaches that.
- **Both peak kinds coexist** — 809 reported ATHs alongside 6 surviving
  candle-derived rows, each labelled correctly in the drawer.
- **`DatePicker`'s date tabs render** against real stored history.

Still not exercised: `LoadingScreen`, and `EmptyState`'s error variant.

---

## 3. Code quality, deferred

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

## 4. Latent risk to remember

`peak-backfill` still runs hourly against Solana Tracker. It stays cheap only
because pump.fun now writes a peak row for essentially every token, so
`observedPeaks.pending` skips them. **If pump.fun ever stops returning
`ath_market_cap`, every new mint becomes pending** and the job would quietly
start burning Solana Tracker quota at ~20x the rate it was designed for
(capacity is 150/run hourly against a 2,500/month free plan). The retirement
step in PLAN.md removes this entirely.
