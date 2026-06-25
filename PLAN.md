# meta.tracker — Plan

Forward-looking plan and active risks. Past incidents, rollout logs, and the
changelog are archived in [docs/HISTORY.md](docs/HISTORY.md). Stable
architecture and operations docs live in [README.md](README.md); the session
quick-reference is [CLAUDE.md](CLAUDE.md).

## Status (June 2026)

- Production is healthy: the scheduled sync runs every 2 hours (UTC),
  `/api/health` is green, and daily snapshots have been continuous in recent
  weeks (~17–66 tokens per snapshot, 100% DexScreener enrichment).
- Reliability hardening is live: durable `syncRuns` audit log, Convex-backed
  `/api/health`, bounded retries, snapshot write-guards, admin-only `force=true`
  and `POST /api/backfill`, and a GitHub Actions health monitor.
- The token detail drawer + data freshness bar shipped to `main` (see HISTORY).
- Volume-first redesign, 2h sync cadence, and recency-based health are **live in
  production** (deployed 2026-06-23, see HISTORY): Convex `dusty-ox-307` updated
  via `convex dev --once`, Netlify deployed, `function_schedules` cron verified,
  banners populating (48/59), `/api/health` green.
- Token creation time now shows in the list rows next to age — local-zone with a
  label (e.g. `Jun 23, 10:15 PM PDT`), at `md`+ width — reusing the drawer's
  shared `formatDateTime` (2026-06-23).

## Active risks

- **Dune API key is fragile.** The account was reported banned for a ToS
  violation; the key still works. A real-looking key was committed to git
  history. Do not rotate or revoke the production key until a tested replacement
  exists, and never print it in repos, docs, logs, or screenshots.
- **Recoverability, not credits, is the main gap.** Monitoring detects missing
  slots; backfill repairs them. Always start a backfill with `dryRun=true`.
- **`/api/scheduled-sync` is unauthenticated** (found 2026-06-23). It's a public
  `type: "background"` function with a cron schedule, so a plain HTTP POST runs
  the full sync (Dune + DexScreener + Convex write). Dune reads are ~free so
  abuse impact is low, but it should be gated — the hard part is distinguishing
  Netlify's cron invocation from a public POST.
- **Stale-cache UX.** Softened (2026-06-22): the freshness bar no longer turns
  alarming orange, and the 2-hourly sync keeps the stored snapshot within ~2h of
  Dune's latest. A brief `cache-stale` label can still appear between a Dune
  re-execution and the next sync.
- **Client cache has no TTL.** The frontend keeps a `live` result for the
  session with no freshness check.
- **Partial typecheck coverage.** Netlify/Convex code isn't in the root build;
  `npm run typecheck:functions` and `tsc -p convex/tsconfig.json` cover it.
- **Bundle size.** One ~560 KB JS chunk (MUI-heavy); known Vite warning.

## Open work

Credentials / Dune (blocked on account recovery):

- [ ] Keep the current Netlify `DUNE_API_KEY` until a tested replacement exists.
- [ ] Appeal the Dune ban; confirm whether the key is expected to keep working.
- [ ] When access is restored: create a new key, store it in Netlify, deploy,
      verify, then revoke the old exposed key.
- [ ] Fork or recreate the Dune query under a controlled account/team.

Product (after reliability/credential work):

- [ ] Token search by name/symbol.
- [ ] Token watchlist (saved to local storage).
- [ ] Real-time updates via Helius WebSocket.
- [x] Soften the stale-cache treatment (done 2026-06-22 — quieter bar + 2h sync).
- [ ] Add a client-cache TTL / freshness check.
- [ ] Optional finer-grained sync alerting (the GitHub Actions `/api/health`
      monitor flags a stalled sync — no success within ~4.5h — within ~10 min).

Cleanup (from the 2026-06-22 redesign):

- [ ] Remove the now-dead `bySlots` query in `convex/syncRuns.ts` (and its
      `by_slot` index if nothing else needs it) — requires `convex codegen`.
- [ ] Update `backfill.ts` to the 2h slot vocabulary: `parseSlotHour` only
      accepts `0 | 12` and `buildWindow` builds 12h/24h windows. Still works for
      daily reconstruction (default 24h window), but no longer mirrors the live
      cadence.

## Reminders

- Only scheduled sync and admin backfill write durable snapshots; live/manual
  fetches must not advance `duneMetadata` unless a matching snapshot is stored.
- After any Netlify deploy that touches functions, verify deploy metadata
  includes `function_schedules: [{ name: "scheduled-sync", cron: "0 */2 * * *" }]`.
- Date tabs are rolling snapshot windows, not DexScreener `pairCreatedAt` buckets.
- `syncRuns` + `/api/health` are the operational health source, not snapshot
  presence alone (sync runs every 2h; one snapshot row per day, overwritten each run).
