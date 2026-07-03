import { NextResponse, type NextRequest } from 'next/server';
import { getSnapshots } from '@/lib/data/snapshots';
import { getClaimProofs, type ClaimProofPoint } from '@/lib/data/claims';
import { rangeWindow } from '@/lib/timeranges';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';

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
  staked: Array<{ date: string; supplierPokt: number; validatorPokt: number; appPokt: number }>;
  interval: 'hour' | 'day' | 'week';
}

export async function GET(req: NextRequest) {
  const rangeParam = req.nextUrl.searchParams.get('range');
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const w = rangeWindow(range);

  const [snaps, claims] = await Promise.all([getSnapshots(w.startISO, w.endISO, 3600), getClaimProofs(range)]);
  const latest = snaps.at(-1) ?? null;
  const toPokt = (u: number) => u / UPOKT_PER_POKT;

  const stats: NetworkStats = {
    stakedValidators: latest?.stakedValidators ?? 0,
    stakedSuppliers: latest?.stakedSuppliers ?? 0,
    stakedApps: latest?.stakedApps ?? 0,
    stakedGateways: latest?.stakedGateways ?? 0,
    snapshotDate: latest?.date ?? null,
  };

  return NextResponse.json({
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
    staked: snaps.map((s) => ({
      date: s.date,
      supplierPokt: toPokt(s.supplierTokens),
      validatorPokt: toPokt(s.validatorTokens),
      appPokt: toPokt(s.appTokens),
    })),
    interval: w.interval,
  } satisfies NetworkResponse);
}
