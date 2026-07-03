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

// Aggregate supplier count + staked tokens across the passed domains (call once per domain for rows).
export const SUPPLIER_STATS_BY_DOMAINS = /* GraphQL */ `
  query supplierStatsByDomains($domains: [String]) {
    getSupplierStatsByDomains(pDomains: $domains)
  }
`;

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

// Services list (id + label) for the Services picker. Connection caps at 100 → paginate with offset.
export const SERVICES_LIST_PAGE = /* GraphQL */ `
  query servicesListPage($offset: Int) {
    services(first: 100, offset: $offset, orderBy: ID_ASC) {
      nodes {
        id
        name
      }
    }
  }
`;

// ── Owner Staking (addresses are [String]) ──
export const REWARDS_BY_ADDRESSES_TIME = /* GraphQL */ `
  query rewardsByAddressesTime($addresses: [String], $start: Datetime, $end: Datetime) {
    getRewardsByAddressesAndTime(addresses: $addresses, startDate: $start, endDate: $end)
  }
`;

export const REWARDS_BY_ADDRESS_DATE = /* GraphQL */ `
  query rewardsByAddressDate($addresses: [String], $start: Datetime, $end: Datetime, $interval: String) {
    getRewardsByAddressesAndTimeGroupByAddressAndDate(addresses: $addresses, startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

export const REWARDS_BY_DATE_GROUPED = /* GraphQL */ `
  query rewardsByDateGrouped($addresses: [String], $start: Datetime, $end: Datetime, $interval: String) {
    getRewardsByAddressesAndTimeGroupByDate(addresses: $addresses, startDate: $start, endDate: $end, truncInterval: $interval)
  }
`;

// eventClaimSettleds: 23.2M rows — ALWAYS filter (by owner) + paginate. transactionId can be null.
export const EVENT_CLAIM_SETTLEDS = /* GraphQL */ `
  query eventClaimSettleds($owners: [String!], $first: Int, $offset: Int) {
    eventClaimSettleds(filter: { supplierOwnerId: { in: $owners } }, orderBy: BLOCK_ID_DESC, first: $first, offset: $offset) {
      totalCount
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
