import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { SUPPLIER_DOMAINS } from '@/lib/queries/analytics';
import { num } from './_util';

// Suppliers by-domain (aggregate). Domains are derived from supplier serviceConfig endpoint hosts (§9.1 resolution).
// getSupplierDomainsList ranks them by lifetime claimed rewards and counts, per domain, the Staked suppliers with a
// live config on it and their stake, in one call.

interface DomainStatRaw {
  domain: string;
  stakedSuppliers: number | string;
  stakedUpokt: number | string;
}

export interface DomainRow {
  domain: string;
  suppliers: number;
  stakedPokt: number;
  avgStakePokt: number;
  sharePct: number; // share of total staked across tracked domains
}

/** Top supplier domains, ranked by lifetime claimed rewards (cap bounds the table). */
async function statDomains(cap = 40): Promise<Array<{ domain: string; suppliers: number; stakedUpokt: number }>> {
  const data = await gqlFetch<{ getSupplierDomainsList: DomainStatRaw[] | null }>(
    NETWORK,
    SUPPLIER_DOMAINS,
    { top: cap },
    { revalidate: 6 * 3600 },
  );
  return (data.getSupplierDomainsList ?? [])
    .filter((d) => d.domain)
    .map((d) => ({ domain: d.domain, suppliers: num(d.stakedSuppliers), stakedUpokt: num(d.stakedUpokt) }));
}

export async function getDomainTable(): Promise<DomainRow[]> {
  const stats = await statDomains();
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
