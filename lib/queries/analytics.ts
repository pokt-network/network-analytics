// Analytics resolver query strings. These `get*` resolvers return JSON/String scalars (some
// double-encoded) — hand-authored payload types live in lib/data/*. Shapes verified live 2026-07-03.

export const RELAYS_BY_SERVICE_PER_POINT = /* GraphQL */ `
  query relaysByServicePerPoint($start: Datetime, $end: Datetime, $interval: String) {
    getRelaysByServicePerPointJson(startTimestamp: $start, endTimestamp: $end, truncInterval: $interval)
  }
`;

export const SERVICES_PERFORMANCE = /* GraphQL */ `
  query servicesPerformance($endCurrent: Datetime, $mid: Datetime, $startPrev: Datetime) {
    servicesPerformanceBetweenTimes(
      endCurrent: $endCurrent
      startCurrentAndEndPrevious: $mid
      startPrevious: $startPrev
    )
  }
`;

export const REWARDS_BY_DATE = /* GraphQL */ `
  query rewardsByDate($start: Datetime, $end: Datetime, $interval: String) {
    getRewardsByDate(startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

export const LATEST_BLOCKS_BY_DAY = /* GraphQL */ `
  query latestBlocksByDay($start: Datetime, $end: Datetime) {
    getLatestBlocksByDay(startDate: $start, endDate: $end)
  }
`;

export const SERVICES_COUNT = /* GraphQL */ `
  query servicesCount {
    services {
      totalCount
    }
  }
`;

export const CLAIM_PROOFS_BY_TIME = /* GraphQL */ `
  query claimProofsByTime($start: Datetime, $end: Datetime, $interval: String) {
    getClaimProofsDataByTime(startTs: $start, endTs: $end, truncInterval: $interval)
  }
`;

// Distinct supplier domains (derived from serviceConfig endpoint hosts) + reward sums for ranking.
export const DOMAINS_DISTINCT = /* GraphQL */ `
  query domainsDistinct {
    domainServiceDailyRewards {
      groupedAggregates(groupBy: [DOMAIN]) {
        keys
        sum {
          grossRewards
        }
      }
    }
  }
`;

// Aggregate supplier count + staked tokens across the passed domains. The resolver sums every domain it
// is given into one result, so per-domain rows need one call per domain: they go as aliases d0, d1, …
// of a single request.
export function supplierStatsByDomainsQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$d${i}: [String]`).join(', ');
  const fields = Array.from({ length: count }, (_, i) => `d${i}: getSupplierStatsByDomains(pDomains: $d${i})`).join('\n    ');
  return /* GraphQL */ `
  query supplierStatsByDomains(${vars}) {
    ${fields}
  }
`;
}

export const TOTAL_SUPPLY_BY_DAY = /* GraphQL */ `
  query totalSupplyByDay($start: Datetime, $end: Datetime) {
    getTotalSupplyByDay(startDate: $start, endDate: $end)
  }
`;

export const SUPPLY_COMPOSITION = /* GraphQL */ `
  query supplyComposition($start: Datetime, $end: Datetime, $interval: String) {
    getSupplyCompositionBetweenDates(startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

// Current on-chain tokenomics param (upsert-latest). Never hardcode mint_ratio — read it live.
export const TOKENOMICS_PARAM = /* GraphQL */ `
  query tokenomicsParam($key: String!) {
    params(filter: { namespace: { equalTo: "tokenomics" }, key: { equalTo: $key } }, first: 1) {
      nodes {
        key
        value
      }
    }
  }
`;

// Services list (id + label) for the Services picker. The indexer returns up to 1000 rows per page; a longer
// list is walked with `after` = the previous page's endCursor.
export const SERVICES_LIST = /* GraphQL */ `
  query servicesList($after: Cursor) {
    services(first: 1000, orderBy: ID_ASC, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
      }
    }
  }
`;

// ── Owner Staking (addresses are [String]) ──
// legacy* = the getRewardsByAddressesAndTime* arguments and JSON, read from the settlement tables.
// Settled claims of the owners' suppliers in [start, end), from the settlement catalog (one aggregate row).
export const OWNER_SETTLED_CLAIMS = /* GraphQL */ `
  query ownerSettledClaims($owners: [String], $start: Datetime!, $end: Datetime!) {
    getSupplierEarningsJson(suppliers: null, rangeStart: $start, rangeEnd: $end, bySupplier: false, owners: $owners)
  }
`;

export const REWARDS_BY_ADDRESSES_TIME = /* GraphQL */ `
  query rewardsByAddressesTime($addresses: [String], $start: Datetime, $end: Datetime) {
    legacyRewardsByAddressesAndTime(addresses: $addresses, startDate: $start, endDate: $end)
  }
`;

export const REWARDS_BY_ADDRESS_DATE = /* GraphQL */ `
  query rewardsByAddressDate($addresses: [String], $start: Datetime, $end: Datetime, $interval: String) {
    legacyRewardsByAddressesAndTimeGroupByAddressAndDate(addresses: $addresses, startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

export const REWARDS_BY_DATE_GROUPED = /* GraphQL */ `
  query rewardsByDateGrouped($addresses: [String], $start: Datetime, $end: Datetime, $interval: String) {
    legacyRewardsByAddressesAndTimeGroupByDate(addresses: $addresses, startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

// eventClaimSettleds: 23.2M rows — ALWAYS filter (by owner) + paginate. transactionId can be null.
// ID_DESC orders the rows of one block, so the order is total. A walk over many pages (the CSV export)
// passes `after` = the previous page's endCursor, a keyset on (block, id): a settlement indexed meanwhile
// cannot shift the rows as it does with OFFSET (which then repeats and drops rows across pages). totalCount
// counts every settlement of the owners (seconds for a large owner), so it is only fetched when asked for.
export const EVENT_CLAIM_SETTLEDS = /* GraphQL */ `
  query eventClaimSettleds($owners: [String!], $first: Int, $offset: Int, $after: Cursor, $withCount: Boolean!) {
    eventClaimSettleds(filter: { supplierOwnerId: { in: $owners } }, orderBy: [BLOCK_ID_DESC, ID_DESC], first: $first, offset: $offset, after: $after) {
      totalCount @include(if: $withCount)
      pageInfo {
        endCursor
        hasNextPage
      }
      nodes {
        serviceId
        numRelays
        claimedAmount
        settledAmount
        mintedAmount
        mintRatio
        transactionId
        blockId
        supplierOwnerId
      }
    }
  }
`;
