# meta.tracker — Plan

Forward-looking plan and active risks. Past incidents, rollout logs, and the
changelog are archived in [docs/HISTORY.md](docs/HISTORY.md). Stable
architecture and operations docs live in [README.md](README.md); the session
quick-reference is [CLAUDE.md](CLAUDE.md).

## Status (June 2026)

- Production is healthy: the scheduled sync runs at 00:00 / 12:00 UTC,
  `/api/health` is green, and daily snapshots have been continuous in recent
  weeks (~17–66 tokens per snapshot, 100% DexScreener enrichment).
- Reliability hardening is live: durable `syncRuns` audit log, Convex-backed
  `/api/health`, bounded retries, snapshot write-guards, admin-only `force=true`
  and `POST /api/backfill`, and a GitHub Actions health monitor.
- The token detail drawer + data freshness bar shipped to `main` (see HISTORY).

## Active risks

- **Dune API key is fragile.** The account was reported banned for a ToS
  violation; the key still works. A real-looking key was committed to git
  history. Do not rotate or revoke the production key until a tested replacement
  exists, and never print it in repos, docs, logs, or screenshots.
- **Recoverability, not credits, is the main gap.** Monitoring detects missing
  slots; backfill repairs them. Always start a backfill with `dryRun=true`.
- **Stale-cache UX.** Between the 2×/day syncs, Dune's rolling query re-executes,
  so the freshness bar reads "stale cache" for most of the inter-sync window even
  when data is only hours old. Works as defined, but worth softening.
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
- [ ] Soften the stale-cache treatment and/or add a client-cache TTL.
- [ ] Dedicated per-cron-slot sync alerting (the GitHub Actions `/api/health`
      monitor already flags missing slots within ~10 min).

## Reminders

- Only scheduled sync and admin backfill write durable snapshots; live/manual
  fetches must not advance `duneMetadata` unless a matching snapshot is stored.
- After any Netlify deploy that touches functions, verify deploy metadata
  includes `function_schedules: [{ name: "scheduled-sync", cron: "0 0,12 * * *" }]`.
- Date tabs are rolling snapshot windows, not DexScreener `pairCreatedAt` buckets.
- `syncRuns` + `/api/health` are the operational health source, not snapshot
  presence alone (two cron slots per day, one snapshot row per day).
