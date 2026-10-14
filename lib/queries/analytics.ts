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

// Supplier domains (derived from serviceConfig endpoint hosts) ranked by lifetime claimed rewards, with the Staked
// suppliers that have a live config on each and their stake, in one call.
export const SUPPLIER_DOMAINS = /* GraphQL */ `
  query supplierDomains($top: Int) {
    getSupplierDomainsList(top: $top) {
      domain
      stakedSuppliers
      stakedUpokt
    }
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

// The last block the indexer processed: the height a walk over several list pages reads every page at.
export const LAST_PROCESSED_HEIGHT = /* GraphQL */ `
  query lastProcessedHeight {
    _metadata {
      lastProcessedHeight
    }
  }
`;

// Services list (id + label) for the Services picker. The indexer returns up to 1000 rows per page; a longer
// list is walked with `after` = the previous page's endCursor, every page at the same $blockHeight (one snapshot).
export const SERVICES_LIST = /* GraphQL */ `
  query servicesList($after: Cursor, $blockHeight: String!) {
    services(first: 1000, orderBy: ID_ASC, after: $after, blockHeight: $blockHeight) {
      totalCount
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

// Settled claims of the suppliers the owners own now, newest first (by height, then event_idx), over the whole
// history, from the settlement catalog: {range, data}, range = the part of the history the settlement tables cover
// (they can lag the indexed blocks). At most $rowLimit rows (up to 1000); the next page passes the last row's height
// and event_idx as $beforeHeight / $beforeEventIdx, a keyset: a settlement indexed meanwhile cannot shift the rows as it
// does with OFFSET. supplier_id is the operator (node) address — the useful per-row identity across a fleet;
// supplier_owner_id is the owner the settlement recorded. Numbers come as strings.
export const OWNER_CLAIMS = /* GraphQL */ `
  query ownerClaims($owners: [String], $rowLimit: Int, $beforeHeight: BigInt, $beforeEventIdx: Int) {
    getClaimsJson(
      suppliers: null
      rangeStart: null
      rangeEnd: null
      owners: $owners
      statuses: ["settled"]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeEventIdx: $beforeEventIdx
    )
  }
`;

// ── Operator / Owner suppliers + stake-filter queries (staking tools) ──
// One row for the whole fleet now: how many suppliers and their combined stake. Pass owners (the suppliers they own
// now) or operators (the Staked suppliers whose service configs share revenue with them now), not both.
export const SUPPLIER_FLEET_SUMMARY = /* GraphQL */ `
  query supplierFleetSummary($owners: [String], $operators: [String]) {
    getSupplierFleetList(owners: $owners, operators: $operators, bySupplier: false) {
      supplierCount
      stakeUpokt
    }
  }
`;

// The suppliers listed (up to 200) now: serviceCount is the number of services each has a live config for.
export const SUPPLIER_SERVICE_COUNTS = /* GraphQL */ `
  query supplierServiceCounts($suppliers: [String]) {
    getSupplierFleetList(suppliers: $suppliers) {
      supplierId
      serviceCount
    }
  }
`;

// One page of the operators' suppliers now, largest stake first (then by id), and their count, in one request (one
// snapshot). The next page passes $after = the rows below the previous page's last (stake, id), a keyset: a stake
// change between two pages cannot shift rows as OFFSET does. serviceCount is the number of services the supplier has a
// live config for.
export const OPERATOR_SUPPLIERS = /* GraphQL */ `
  query operatorSuppliers($operators: [String], $first: Int, $after: GetSupplierFleetRecordFilter) {
    rows: getSupplierFleetList(operators: $operators, first: $first, filter: $after) {
      supplierId
      ownerId
      stakeUpokt
      stakeStatus
      serviceCount
    }
    fleet: getSupplierFleetList(operators: $operators, bySupplier: false) {
      supplierCount
    }
  }
`;

// ── Operator Staking (addresses are rev-share recipients, not owners) ──
// The Operator tool's addresses are the rev-share / node-runner addresses that appear in a supplier's
// serviceConfig.revShare. The fleet rollup, the supplier list, the claim/proof series and the slashes take them as the
// catalog's `operators` (the Staked suppliers whose live service configs share revenue with them). The
// rewards-by-service and overserviced resolvers take the rev-share addresses directly.

// Settled and expired/discarded claims per bucket of the suppliers that share revenue with the operators now, from the
// settlement catalog (one aggregate series each).
export const OPERATOR_CLAIMS_SETTLED = /* GraphQL */ `
  query operatorClaimsSettled($operators: [String], $start: Datetime!, $end: Datetime!, $bucket: String) {
    getSupplierEarningsJson(suppliers: null, rangeStart: $start, rangeEnd: $end, bucket: $bucket, bySupplier: false, operators: $operators)
  }
`;

export const OPERATOR_CLAIM_PENALTIES = /* GraphQL */ `
  query operatorClaimPenalties($operators: [String], $start: Datetime!, $end: Datetime!, $bucket: String) {
    getSupplierPenaltiesJson(suppliers: null, rangeStart: $start, rangeEnd: $end, bucket: $bucket, bySupplier: false, operators: $operators)
  }
`;

export const REWARDS_BY_ADDRESSES_SERVICE = /* GraphQL */ `
  query rewardsByAddressesService($addresses: [String], $start: Datetime, $end: Datetime) {
    legacyRewardsByAddressesAndTimeGroupByService(addresses: $addresses, startTs: $start, endTs: $end)
  }
`;

export const OVERSERVICED_BY_ADDRESSES = /* GraphQL */ `
  query overservicedByAddresses($addresses: [String!], $start: Datetime, $end: Datetime, $interval: String) {
    getOverservicedByAddressesAndTime(addresses: $addresses, startTs: $start, endTs: $end, truncInterval: $interval)
  }
`;

// Suppliers matching a SupplierFilter on their own columns (ownerId + stake status for the Owner tool), ranked by
// stake, then id. The next page passes $after = the previous page's endCursor, a keyset on (stake, id). The number of
// services each is configured for comes from SUPPLIER_SERVICE_COUNTS.
export const SUPPLIERS_LIST = /* GraphQL */ `
  query suppliersList($filter: SupplierFilter!, $first: Int, $after: Cursor) {
    suppliers(filter: $filter, orderBy: [STAKE_AMOUNT_DESC, ID_ASC], first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        ownerId
        stakeAmount
        stakeStatus
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

// Slashing events of the operators' suppliers in [start, end), newest first (by height, then id), and the range's
// totals, in one request (one snapshot). At most $rowLimit rows (up to 1000); the next page passes the last row's height
// and id as $beforeHeight / $beforeId. stakeUpokt is the stake after the slash; proofValidationStatus can be null. The
// totals are the getSupplierPenaltiesJson rows of kind 'slashed' (one per reason): events and slashed upokt.
export const SUPPLIER_SLASHES = /* GraphQL */ `
  query supplierSlashes($operators: [String], $start: Datetime!, $end: Datetime!, $rowLimit: Int, $beforeHeight: BigInt, $beforeId: String) {
    getActorLifecycleList(
      kind: "supplier"
      addresses: null
      rangeStart: $start
      rangeEnd: $end
      operators: $operators
      events: ["slash"]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeId: $beforeId
    ) {
      height
      id
      actorId
      penaltyUpokt
      previousStakeUpokt
      stakeUpokt
      proofValidationStatus
      serviceId
      applicationId
    }
    getSupplierPenaltiesJson(suppliers: null, rangeStart: $start, rangeEnd: $end, bySupplier: false, operators: $operators)
  }
`;
