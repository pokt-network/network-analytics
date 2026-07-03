import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { DOMAINS_DISTINCT, SUPPLIER_STATS_BY_DOMAINS } from '@/lib/queries/analytics';
import { num } from './_util';

// Suppliers by-domain (aggregate). Distinct domains come from domainServiceDailyRewards grouped by
// DOMAIN (§9.1 resolution — domains are derived from supplier serviceConfig endpoint hosts). Then
// getSupplierStatsByDomains([domain]) is called once per domain for accurate distinct counts + stake.

interface DomainGroup {
  keys: string[] | null;
  sum: { grossRewards: string | number | null } | null;
}

/** Distinct supplier domains, ranked by gross reward activity (cap to bound the per-domain calls). */
export async function getDistinctDomains(cap = 40): Promise<string[]> {
  const data = await gqlFetch<{ domainServiceDailyRewards: { groupedAggregates: DomainGroup[] } | null }>(
    NETWORK,
    DOMAINS_DISTINCT,
    undefined,
    { revalidate: 6 * 3600 },
  );
  const groups = data.domainServiceDailyRewards?.groupedAggregates ?? [];
  return groups
    .map((g) => ({ domain: g.keys?.[0] ?? '', gross: num(g.sum?.grossRewards) }))
    .filter((g) => g.domain)
    .sort((a, b) => b.gross - a.gross)
    .slice(0, cap)
    .map((g) => g.domain);
}

interface DomainStatRaw {
  suppliers_count: number | string;
  total_staked_tokens: number | string;
}

export interface DomainRow {
  domain: string;
  suppliers: number;
  stakedPokt: number;
  avgStakePokt: number;
  sharePct: number; // share of total staked across tracked domains
}

async function statDomain(domain: string): Promise<{ domain: string; suppliers: number; stakedUpokt: number }> {
  const data = await gqlFetch<{ getSupplierStatsByDomains: DomainStatRaw | null }>(
    NETWORK,
    SUPPLIER_STATS_BY_DOMAINS,
    { domains: [domain] },
    { revalidate: 6 * 3600 },
  );
  const s = data.getSupplierStatsByDomains;
  return { domain, suppliers: num(s?.suppliers_count), stakedUpokt: num(s?.total_staked_tokens) };
}

export async function getDomainTable(): Promise<DomainRow[]> {
  const domains = await getDistinctDomains();
  const stats = await Promise.all(domains.map(statDomain));
  const totalStakedUpokt = stats.reduce((s, d) => s + d.stakedUpokt, 0) || 1;
  const rows: DomainRow[] = stats.map((d) => ({
    domain: d.domain,
    suppliers: d.suppliers,
    stakedPokt: d.stakedUpokt / UPOKT_PER_POKT,
    avgStakePokt: d.suppliers > 0 ? d.stakedUpokt / d.suppliers / UPOKT_PER_POKT : 0,
    sharePct: (d.stakedUpokt / totalStakedUpokt) * 100,
  }));
  rows.sort((a, b) => b.stakedPokt - a.stakedPokt);
  return rows;
}
