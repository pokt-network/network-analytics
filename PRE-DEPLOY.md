# Pre-deploy checklist & decisions

Records the §9 DECIDE/PROBE items from the build brief and the calls made during the build.

## Environment (Vercel)

| Var | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_GRAPHQL_URL` | Mainnet indexer | defaults to `https://data.pocket.network/graphql` |
| `SAURON_LCD_URL` / `SAURON_RPC_URL` | LCD/RPC fallback + params | server-side only |
| `NEXT_PUBLIC_INDEXER_LAG_THRESHOLD` | live-badge lag threshold | default 5 |
| `NEXT_PUBLIC_EXPLORER_BASE_URL` | reward-issuance tx link-outs | `https://explorer.pocket.network` |
| **`CMC_API_KEY`** | POKT price/market cap | **server-only — never expose.** Price shows `—` until set. |

## DECIDE / PROBE resolutions

1. **Monorepo vs packages (§2)** → **Vendored dir + `scripts/sync-vendor.mjs`.** Explorer repo
   untouched; drift caught by `npm run sync-vendor:check` (wire into CI).
2. **Stack** → **Tailwind + Recharts**, tokens mapped onto the explorer's CSS custom properties
   (single source of truth; no hand-copied token file).
3. **Multi-network** → **mainnet only** for v1. Network layer vendored (`NETWORK='main'`), no
   `[network]` routing/switcher built.
4. **Supplier domain list (§9.1 PROBE)** → resolved. Distinct domains come from
   `domainServiceDailyRewards` grouped by `DOMAIN`; each is stat'd via `getSupplierStatsByDomains`.
   (Verified: `getSupplierStatsByDomains` takes `[String]` and **aggregates** across inputs → call
   once per domain.) Capped at top-40 by reward activity.
5. **Price source (§9.4)** → **CoinMarketCap**, server-side key, 60s cache.
6. **Gross burn/mint precompute (§4 / §9)** → **NOT built as a cron/precompute pipeline.**
   Derived **live** instead: per PIP-41 each settlement mints `claimed × mint_ratio` and burns the
   full claimed amount, so daily `Σclaimed` (from `getRewardsByDate`) × the live `mint_ratio` gives
   the gross bars exactly (verified: mockup's mint/burn ratio == on-chain `mint_ratio` 0.975). Net
   inflation is the `getTotalSupplyByDay` delta. This avoids scanning the 23.2M-row settlement table
   and needs no Vercel Cron/Blob for v1. **If per-settlement fidelity is later required** (e.g. the
   `mint_ratio` changes mid-window and exact historical splits matter), add the scheduled rollup then.
7. **Supply projection methodology (§6 / §9.2)** → v1 ships a **naive flat-rate** extrapolation
   (three demand scenarios, all deflationary), clearly labeled and noted as pending PNF sign-off for
   the mechanistic model + scenario definitions.
8. **`getRewardsByDomainsAndTimeGroupByServiceV2` broken (§9.3)** → not used. The Services tab derives
   gross rewards from `getRelaysByServicePerPointJson.claimed_upokt`. **Flag to Otto:** fix/deprecate
   the V2 function (PG 42702, ambiguous `domains` column).
9. **`mint_ratio` = 0.975, `global_inflation_per_claim` = 0.000001** at build time. Net inflation is
   read from supply deltas (authoritative regardless of regime); `mint_ratio` is read live for the
   burn/mint bars — never hardcoded.

## Verify before deploy

- [ ] `npm run lint && npm run build` clean (currently ✓).
- [ ] `CMC_API_KEY` set in Vercel; `/api/live` and `/api/price` return a real price.
- [ ] Visual QA in a real browser: all five tabs + Owner Staking, **light and dark**, charts render,
      range pills refetch, services multi-select + picker work, Owner Staking persists across reload
      and drops malformed addresses. *(The sandbox screenshot tool was unavailable during the build —
      this pass is outstanding.)*
- [ ] `data/supply-events.json` reviewed by PNF (currently seeds only the verified PIP-41 pin).
- [ ] Owner Staking reward-issuance links resolve to the explorer tx page.

## Performance / caching

The load time is bounded by the **indexer**, not our code — `servicesPerformanceBetweenTimes` alone
takes ~3.8s. Two layers cache it:
- `gqlFetch` sets `next.revalidate` per query (Next Data Cache).
- Each heavy route (`/api/traffic|network|suppliers|economy|services*`) wraps its assembled payload
  in `unstable_cache` keyed by range. Measured: **cold ~1.6–4.3s, warm ~8ms**. `next dev` disables
  the fetch cache, so a fresh dev process pays the cold hit once per key; production keeps both.
- If cold latency needs to disappear entirely, add a Vercel Cron warmer that pre-hits the standard
  (range × tab) keys, or precompute those payloads to Blob.

## Trailing-bucket projection

Time-series use daily/hourly buckets ending "now", so the current bucket is partial and would read as
a false downward step. `TimeChart` projects it to a full-period estimate (`actual / elapsed_fraction`)
and draws it **dashed** (line/area) or **translucent** (bar) — matching PoktScan's end-of-day
projection. Applied to Traffic Over Time, Claims/Proofs, and Burn vs Mint. Each of those charts also
has a line/area↔bar toggle.

## Known v1 limitations

- Snapshot-based charts (Network/Suppliers evolution) are **daily** (`getLatestBlocksByDay`), so a
  24h range shows only 1–2 points. Labeled "as of last daily snapshot."
- Economy widgets are long-horizon (supply 1yr, burn/mint 7d, projection 2yr) and don't follow the
  range pills.
- Owner Staking stat cards show total rewards (window) + all-time settlement count; a full relays/
  avg-ratio aggregate across all settlements is out of scope (would require scanning the owner's full
  settlement history).
