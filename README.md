# analytics.pocket.network

Public, read-only network analytics for Pocket Network — a five-tab dashboard
(**Traffic · Economy · Network · Suppliers · Services**) plus an **Owner Staking** tool.

The second half of the PoktScan monolith split (sibling to
[`explorer.pocket.network`](https://explorer.pocket.network)); replaces the decommissioned PoktScan
analytics surfaces and the pokt.money economics page. All data is queried live from
`data.pocket.network`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Recharts · Vercel.

Interactive widgets fetch internal route handlers (`app/api/*`) that call the data layer server-side
with ISR caching — the browser never hits the indexer directly. POKT price comes from CoinMarketCap
(server-only key). The typed indexer client and design tokens are **vendored from the explorer** via
`npm run sync-vendor` so payload types stay in sync between the two apps.

## Quickstart

```bash
cp .env.example .env.local     # indexer/LCD default to mainnet; add CMC_API_KEY for price
npm install
npm run dev                    # http://localhost:3000
```

```bash
npm run build         # production build
npm run lint          # eslint
npm run sync-vendor   # re-sync the vendored client/tokens from the explorer repo
```

## Layout

```
app/          layout (shell) · dashboard · owner-staking · api/* route handlers
components/   shell · ui · charts (Recharts) · tabs · owner
lib/          vendored indexer client · queries/analytics · data/* fetchers · config
data/         supply-events.json (event pins)
scripts/      sync-vendor.mjs
```

See **PRE-DEPLOY.md** for environment variables, data-model notes, and the build decisions.
