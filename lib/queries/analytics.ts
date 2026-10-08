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

// eventClaimSettleds: 23.2M+ rows — ALWAYS filter (by owner) + paginate. transactionId can be null.
// Filter THROUGH the supplier relation (`supplier.ownerId`), NOT the denormalized `supplierOwnerId`
// scalar: that column is populated on only ~25% of rows, so filtering on it silently under-reports a
// fleet's settlements (verified live: relation 5,575,366 vs supplierOwnerId 4,640,974 for one owner).
// ID_DESC orders the rows of one block, so the order is total. A walk over many pages (the CSV export)
// passes `after` = the previous page's endCursor, a keyset on (block, id): a settlement indexed meanwhile
// cannot shift the rows as it does with OFFSET (which then repeats and drops rows across pages). totalCount
// counts every settlement of the owners (seconds for a large owner), so it is only fetched when asked for.
// supplierId is the operator (node) address — the useful per-row identity across a fleet.
export const EVENT_CLAIM_SETTLEDS = /* GraphQL */ `
  query eventClaimSettleds($owners: [String!], $first: Int, $offset: Int, $after: Cursor, $withCount: Boolean!) {
    eventClaimSettleds(filter: { supplier: { ownerId: { in: $owners } } }, orderBy: [BLOCK_ID_DESC, ID_DESC], first: $first, offset: $offset, after: $after) {
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
        supplierId
        supplierOwnerId
        supplier {
          ownerId
        }
      }
    }
  }
`;

// ── Operator / Owner suppliers + stake-filter queries (staking tools) ──
export const SUPPLIER_OWNER_SUMMARY = /* GraphQL */ `
  query supplierOwnerSummary($owners: [String!]) {
    suppliers(filter: { ownerId: { in: $owners } }) {
      totalCount
      aggregates {
        sum {
          stakeAmount
        }
      }
    }
  }
`;

// ── Operator Staking (addresses are rev-share recipients, not owners) ──
// The Operator tool's addresses are the rev-share / node-runner addresses that appear in a supplier's
// serviceConfig.revShare. The fleet rollup + slashes are therefore scoped by a SupplierFilter built
// in lib/data/operator.ts (an OR of per-address `serviceConfigs.some.revShare.contains`), passed as a
// typed variable rather than string-built. The claim/proof, rewards-by-service, and overserviced
// resolvers take the rev-share addresses directly.

export const OPERATOR_SUPPLIER_SUMMARY = /* GraphQL */ `
  query operatorSupplierSummary($filter: SupplierFilter!) {
    suppliers(filter: $filter) {
      totalCount
      aggregates {
        sum {
          stakeAmount
        }
      }
    }
  }
`;

export const CLAIM_PROOFS_BY_DELEGATORS = /* GraphQL */ `
  query claimProofsByDelegators($addresses: [String!], $start: Datetime, $end: Datetime, $interval: String) {
    getClaimProofsDataByDelegatorsAndTime(addresses: $addresses, startTs: $start, endTs: $end, truncInterval: $interval)
  }
`;

export const REWARDS_BY_ADDRESSES_SERVICE = /* GraphQL */ `
  query rewardsByAddressesService($addresses: [String!], $start: Datetime, $end: Datetime) {
    getRewardsByAddressesAndTimeGroupByService(addresses: $addresses, startTs: $start, endTs: $end)
  }
`;

export const OVERSERVICED_BY_ADDRESSES = /* GraphQL */ `
  query overservicedByAddresses($addresses: [String!], $start: Datetime, $end: Datetime, $interval: String) {
    getOverservicedByAddressesAndTime(addresses: $addresses, startTs: $start, endTs: $end, truncInterval: $interval)
  }
`;

// Suppliers matching an arbitrary SupplierFilter (rev-share for the Operator tool, ownerId + stake
// status for the Owner tool), ranked by stake. serviceConfigs.totalCount is the number of services
// the supplier is configured for.
export const SUPPLIERS_LIST = /* GraphQL */ `
  query suppliersList($filter: SupplierFilter!, $first: Int, $offset: Int) {
    suppliers(filter: $filter, orderBy: STAKE_AMOUNT_DESC, first: $first, offset: $offset) {
      totalCount
      nodes {
        id
        ownerId
        stakeAmount
        stakeStatus
        serviceConfigs {
          totalCount
        }
      }
    }
  }
`;

// Current supplier minimum stake (governance param, upsert-latest). Value is JSON {denom, amount}.
// Available on the indexer `params` resolver — no LCD needed for this one.
export const SUPPLIER_MIN_STAKE = /* GraphQL */ `
  query supplierMinStake {
    params(filter: { namespace: { equalTo: "supplier" }, key: { equalTo: "min_stake" } }, first: 1) {
      nodes {
        value
      }
    }
  }
`;

// Supplier slashing events scoped to the operator's suppliers (filter built from the rev-share
// addresses). proofValidationStatus can be null; sessionId can be empty.
export const SUPPLIER_SLASHES = /* GraphQL */ `
  query supplierSlashes($filter: EventSupplierSlashedFilter!, $first: Int, $offset: Int) {
    eventSupplierSlasheds(filter: $filter, orderBy: BLOCK_ID_DESC, first: $first, offset: $offset) {
      totalCount
      nodes {
        supplierId
        blockId
        proofMissingPenalty
        previousStakeAmount
        afterStakeAmount
        proofValidationStatus
        serviceId
        applicationId
      }
    }
  }
`;
