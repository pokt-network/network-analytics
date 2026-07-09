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
takes ~3.8s. Layers:
- `gqlFetch` sets `next.revalidate` per query (Next Data Cache).
- Each heavy route (`/api/traffic|network|suppliers|economy|services*`) wraps its assembled payload
  in `unstable_cache` keyed by range (stale-while-revalidate). Measured: **cold ~4s, warm ~8ms**.
  The only slow hit is the *first* population of each `(tab × range)` key.
- **Cache warmer** — `/api/cron/warm` pre-populates the common keys (`7d`/`30d` for every tab +
  economy + services list) so a user's first visit is already warm. Scheduled in `vercel.json`
  every 10 min. TTLs are 30 min (10 min for the 24h range); the warmer keeps entries fresh/from
  going cold between visits. Uncommon ranges (24h/60d) warm on first use then cache.
  - **Vercel plan note:** `*/10` cadence needs **Pro**; on **Hobby** cron runs ~once/day, so lean on
    the TTLs there (raise `rangeTTL` if needed).
  - Set **`CRON_SECRET`** in Vercel — the route rejects unauthorized calls when it's set, and Vercel
    Cron passes it automatically. Hit `/api/cron/warm` manually to test; it returns `{warmed,total}`.
  - **Set `CRON_WARM_BASE_URL` to the public domain** (`https://analytics.pocket.network`). Left
    unset, the warmer falls back to `$VERCEL_URL` — the *protected* deployment URL — so the cron
    fetch is bounced by Deployment Protection (401) and warms **nothing**, leaving every visitor on
    the cold ~4s path. This is the most common cause of "the cache never seems to work."

### Live diagnostics (`?diag=1`)

Append **`?diag=1`** to any URL (or press **Ctrl+Shift+D**) to open the cache-diagnostics overlay.
It's inert otherwise, so it's safe in production. The **URL `diag` param is the single source of
truth** — the app preserves it across tab/range navigation, and *clearing it hides the panel* (no
sticky sessionStorage). As the page loads it shows, in real time:
- **HIT / MISS** per `/api/*` payload — a MISS is a cold indexer build (seconds); a HIT is served
  from `unstable_cache` (~ms). Classified server-side by build time and stamped on `x-cache` /
  `x-build-ms` / `x-payload-bytes` / `x-cache-oversize` headers (`lib/diagnostics.ts`).
- **Cache age** per key (`·3m`), plus an `oldest Nm` summary — how long ago each key was last built.
  `stamped()` records build time *inside* the cached value → `x-cache-age-ms`. **If every age stays
  under ~10 min, the cron is warming on schedule;** a key drifting past 11 min (amber) means the
  warmer isn't keeping it hot.
- **Payload size** with a ⚠ when a single entry exceeds Vercel's **2 MB** Data-Cache limit (over
  which the entry is silently *never stored* → a permanent MISS no warmer can fix).
- **Load clock** — FCP / LCP / DOMContentLoaded / load / **network-idle** (fully-rendered) marks.
- **Warmer config** from `/api/diag` — flags the `$VERCEL_URL`-fallback footgun above.
- **Probe caches ×2** re-fetches the heavy routes twice (browser-cache-busted, server-key stable) to
  show the cold→warm transition and each key's age; **Warm now** hits `/api/cron/warm`.

`rangeWindow()`/`fixedWindow()` quantize `now` to a 60s bucket (`WINDOW_BUCKET_MS`) so successive
builds send the indexer identical timestamps — the inner `next:{revalidate}` fetch cache was
previously defeated by ms-resolution `Date.now()`.

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
