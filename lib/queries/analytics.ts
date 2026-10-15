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

// Services list (id + label) for the Services picker. The indexer returns up to 1000 rows per page; a longer
// list is walked with `after` = the previous page's endCursor. The first page comes with the last processed height
// (SERVICES_FIRST_PAGE), and every later page is read at that $blockHeight. The first page's rows and the height come
// in one request but not one snapshot (each field is its own READ COMMITTED statement), so they can be a block apart;
// the walk's count check (rows == totalCount, retried once) catches one that does not add up.
export const SERVICES_FIRST_PAGE = /* GraphQL */ `
  query servicesFirstPage {
    _metadata {
      lastProcessedHeight
    }
    services(first: 1000, orderBy: ID_ASC) {
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
// history, from the settlement catalog. At most $rowLimit rows (up to 1000); the next page passes the last row's height
// and event_idx as $beforeHeight / $beforeEventIdx, a keyset: a settlement indexed meanwhile cannot shift the rows as it
// does with OFFSET. supplier_id is the operator (node) address — the useful per-row identity across a fleet;
// supplier_owner_id is the owner the settlement recorded, current_owner_id the supplier's owner now.
// The pager's page: {range, data}, which carries the covered part of the history (the settlement tables can lag the
// indexed blocks) even when it has no rows, so a page is always one request. Snake-case keys, numbers as strings.
export const OWNER_CLAIMS_PAGE = /* GraphQL */ `
  query ownerClaimsPage($owners: [String], $rowLimit: Int, $beforeHeight: BigInt, $beforeEventIdx: Int) {
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

// The export's page: the same rows as a list with only the fields the CSV writes (about half the bytes of the JSON
// twin); the export needs no range.
export const OWNER_CLAIMS = /* GraphQL */ `
  query ownerClaims($owners: [String], $rowLimit: Int, $beforeHeight: BigInt, $beforeEventIdx: Int) {
    getClaimsList(
      suppliers: null
      rangeStart: null
      rangeEnd: null
      owners: $owners
      statuses: ["settled"]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeEventIdx: $beforeEventIdx
    ) {
      height
      eventIdx
      serviceId
      relays
      settledUpokt
      relayMintedUpokt
      supplierId
      supplierOwnerId
      currentOwnerId
    }
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

// One page of the owners' suppliers now (any status; $stakeStatuses keeps some; $maxStakeUpokt keeps the stakes below it,
// for "below min stake"), largest stake first, then by id, and their count, in one request (not one snapshot: each field
// is its own READ COMMITTED statement), all from the fleet function. The page is the function's own keyset ($rowLimit
// rows after $afterStakeUpokt / $afterSupplierId), which counts services for that page only. The count is the fleet's
// own supplierCount under the same arguments. serviceCount is the number of services the supplier has a live config for.
export const OWNER_SUPPLIERS = /* GraphQL */ `
  query ownerSuppliers(
    $owners: [String]
    $stakeStatuses: [String]
    $maxStakeUpokt: BigFloat
    $rowLimit: Int
    $afterStakeUpokt: BigFloat
    $afterSupplierId: String
  ) {
    rows: getSupplierFleetList(
      owners: $owners
      stakeStatuses: $stakeStatuses
      maxStakeUpokt: $maxStakeUpokt
      rowLimit: $rowLimit
      afterStakeUpokt: $afterStakeUpokt
      afterSupplierId: $afterSupplierId
    ) {
      supplierId
      ownerId
      stakeUpokt
      stakeStatus
      serviceCount
    }
    count: getSupplierFleetList(owners: $owners, stakeStatuses: $stakeStatuses, maxStakeUpokt: $maxStakeUpokt, bySupplier: false) {
      supplierCount
    }
  }
`;

// One page of the operators' suppliers now, largest stake first (then by id), and their count, in one request (not one
// snapshot). The page is the fleet function's own keyset: $rowLimit rows after the previous page's last stake and id
// ($afterStakeUpokt / $afterSupplierId), with services counted for that page only. The other rows do not shift as they
// do with OFFSET, but a supplier whose stake crosses the page boundary between two reads (a slash, a top-up) can be shown
// twice or missed; the tabs flag both (useCursorPages). serviceCount is the number of services the supplier has a live
// config for.
export const OPERATOR_SUPPLIERS = /* GraphQL */ `
  query operatorSuppliers($operators: [String], $rowLimit: Int, $afterStakeUpokt: BigFloat, $afterSupplierId: String) {
    rows: getSupplierFleetList(
      operators: $operators
      rowLimit: $rowLimit
      afterStakeUpokt: $afterStakeUpokt
      afterSupplierId: $afterSupplierId
    ) {
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

// Slashing events of the operators' suppliers in [start, end), newest first (by height, then id). At most $rowLimit
// rows; the next page passes the last row's height and id as $beforeHeight / $beforeId.
// The pager's page: {range, data}, which carries the part of the window the indexed blocks cover even when it has no
// rows, so a page is always one request. Snake-case keys, numbers as strings; stake_upokt is the stake after the slash,
// proof_validation_status can be null.
export const SUPPLIER_SLASH_PAGE = /* GraphQL */ `
  query supplierSlashPage(
    $operators: [String]
    $operatorScope: String
    $start: Datetime
    $end: Datetime
    $rowLimit: Int
    $beforeHeight: BigInt
    $beforeId: String
  ) {
    getActorLifecycleJson(
      kind: "supplier"
      addresses: null
      rangeStart: $start
      rangeEnd: $end
      operators: $operators
      operatorScope: $operatorScope
      events: ["slash"]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeId: $beforeId
    )
  }
`;

// The export's page: the same rows as a list with only the fields the CSV writes (and blockTime, for counting the
// stretches the settlement tables do not cover); the export needs no range.
export const SUPPLIER_SLASHES = /* GraphQL */ `
  query supplierSlashes(
    $operators: [String]
    $operatorScope: String
    $start: Datetime
    $end: Datetime
    $rowLimit: Int
    $beforeHeight: BigInt
    $beforeId: String
  ) {
    getActorLifecycleList(
      kind: "supplier"
      addresses: null
      rangeStart: $start
      rangeEnd: $end
      operators: $operators
      operatorScope: $operatorScope
      events: ["slash"]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeId: $beforeId
    ) {
      height
      id
      blockTime
      actorId
      penaltyUpokt
      previousStakeUpokt
      stakeUpokt
      proofValidationStatus
      serviceId
      applicationId
    }
  }
`;

// The range's slashing totals in one request: getSupplierPenaltiesJson (the settlement tables; rows of kind 'slashed',
// one per reason, with events and slashed_upokt) for the part they cover, and the slashing events of the window's last
// hour ($tailStart..$end) with the part of it the indexed blocks cover, which the caller counts past the settlement
// tables' covered_to (they trail the indexed blocks).
export const SUPPLIER_SLASH_TOTALS = /* GraphQL */ `
  query supplierSlashTotals($operators: [String], $operatorScope: String, $start: Datetime!, $end: Datetime!, $tailStart: Datetime) {
    getSupplierPenaltiesJson(
      suppliers: null
      rangeStart: $start
      rangeEnd: $end
      bySupplier: false
      operators: $operators
      operatorScope: $operatorScope
    )
    tail: getActorLifecycleJson(
      kind: "supplier"
      addresses: null
      rangeStart: $tailStart
      rangeEnd: $end
      operators: $operators
      operatorScope: $operatorScope
      events: ["slash"]
      rowLimit: 1000
    )
  }
`;

// The last settlement the money tables hold, and the last block the indexer finished: a settlement above it is in a
// block still being written (lib/data/settlement.ts).
export const LAST_SETTLEMENT = /* GraphQL */ `
  query lastSettlement {
    getLastSettlement { height blockTime }
    _metadata { lastProcessedHeight }
  }
`;
