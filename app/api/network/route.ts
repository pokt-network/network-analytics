import { type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSnapshots } from '@/lib/data/snapshots';
import { getClaimProofs, type ClaimProofPoint } from '@/lib/data/claims';
import { getSupplyHistory } from '@/lib/data/economy';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, warmTag, type RangeKey } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { diagJson } from '@/lib/diagnostics';

export interface NetworkStats {
  stakedValidators: number;
  stakedSuppliers: number;
  stakedApps: number;
  stakedGateways: number;
  snapshotDate: string | null;
}

export interface NetworkResponse {
  range: RangeKey;
  stats: NetworkStats;
  claims: ClaimProofPoint[];
  participation: Array<{ date: string; suppliers: number; apps: number; validators: number; gateways: number }>;
  /** Total staked POKT (all actors) vs the rest of supply, per day. */
  staked: Array<{ date: string; stakedPokt: number; unstakedPokt: number }>;
  interval: 'hour' | 'day' | 'week';
}

async function buildNetwork(range: RangeKey): Promise<NetworkResponse> {
  const w = rangeWindow(range);

  const [snaps, claims, supply] = await Promise.all([
    getSnapshots(w.startISO, w.endISO, 3600),
    getClaimProofs(range),
    getSupplyHistory(w.startISO, w.endISO, 3600),
  ]);
  const latest = snaps.at(-1) ?? null;
  const toPokt = (u: number) => u / UPOKT_PER_POKT;

  // Total supply by day (already in POKT) so we can split each day into staked vs unstaked.
  const supplyByDay = new Map<string, number>();
  for (const p of supply) supplyByDay.set(p.date.slice(0, 10), p.totalSupplyPokt);

  const stats: NetworkStats = {
    stakedValidators: latest?.stakedValidators ?? 0,
    stakedSuppliers: latest?.stakedSuppliers ?? 0,
    stakedApps: latest?.stakedApps ?? 0,
    stakedGateways: latest?.stakedGateways ?? 0,
    snapshotDate: latest?.date ?? null,
  };

  return {
    range,
    stats,
    claims,
    participation: snaps.map((s) => ({
      date: s.date,
      suppliers: s.stakedSuppliers,
      apps: s.stakedApps,
      validators: s.stakedValidators,
      gateways: s.stakedGateways,
    })),
    staked: snaps.map((s) => {
      const stakedPokt = toPokt(s.supplierTokens + s.validatorTokens + s.appTokens + s.gatewayTokens);
      const totalSupply = supplyByDay.get(s.date.slice(0, 10));
      // Unstaked = everything in supply not currently staked (liquid + unmigrated + pools).
      const unstakedPokt = totalSupply != null ? Math.max(0, totalSupply - stakedPokt) : 0;
      return { date: s.date, stakedPokt, unstakedPokt };
    }),
    interval: w.interval,
  };
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  return diagJson('network', () =>
    unstable_cache(() => buildNetwork(range), ['network', range], {
      revalidate: rangeTTL(range),
      tags: warmTag(range),
    })(),
  );
}
