import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK } from '@/lib/app-config';
import { BLOCK_STATS_BY_DAY, BLOCK_SNAPSHOTS } from '@/lib/queries/analytics';
import { fixedWindow } from '@/lib/timeranges';
import { num, parseScalar } from './_util';
import { unwrapRange } from './coverage';

// Each day's last block (getBlockStatsJson's last_height, then that block): one denormalized daily block snapshot backs ALL actor-count and staked-POKT
// evolution charts (Network + Suppliers) plus the "serving suppliers" stat. ≤24h stale — label
// snapshot-sourced numbers "as of last daily snapshot".

interface BlockRaw {
  id: number | string;
  stakedValidators: number | string;
  stakedSuppliers: number | string;
  stakedApps: number | string;
  stakedGateways: number | string;
  unstakingSuppliers: number | string;
  unstakedSuppliers: number | string;
  stakedValidatorsTokens: number | string;
  stakedSuppliersTokens: number | string;
  stakedAppsTokens: number | string;
  stakedGatewaysTokens: number | string;
}

interface SnapshotRaw {
  date: string;
  block: BlockRaw;
}

interface DayStatsRaw {
  bucket_start: string;
  last_height: string;
}

export interface NetworkSnapshot {
  date: string; // ISO, UTC
  blockHeight: number;
  stakedValidators: number;
  stakedSuppliers: number;
  stakedApps: number;
  stakedGateways: number;
  unstakingSuppliers: number;
  unstakedSuppliers: number;
  // token totals (upokt)
  validatorTokens: number;
  supplierTokens: number;
  appTokens: number;
  gatewayTokens: number;
}

function map(s: SnapshotRaw): NetworkSnapshot {
  const b = s.block;
  return {
    date: toDate(s.date)?.toISOString() ?? s.date,
    blockHeight: num(b.id),
    stakedValidators: num(b.stakedValidators),
    stakedSuppliers: num(b.stakedSuppliers),
    stakedApps: num(b.stakedApps),
    stakedGateways: num(b.stakedGateways),
    unstakingSuppliers: num(b.unstakingSuppliers),
    unstakedSuppliers: num(b.unstakedSuppliers),
    validatorTokens: num(b.stakedValidatorsTokens),
    supplierTokens: num(b.stakedSuppliersTokens),
    appTokens: num(b.stakedAppsTokens),
    gatewayTokens: num(b.stakedGatewaysTokens),
  };
}

export async function getSnapshots(startISO: string, endISO: string, revalidate = 3600): Promise<NetworkSnapshot[]> {
  const stats = await gqlFetch<{ getBlockStatsJson: unknown }>(
    NETWORK,
    BLOCK_STATS_BY_DAY,
    { start: startISO, end: endISO },
    { revalidate },
  );
  // a day the indexer does not cover has no row (no snapshot), as before
  const days = (unwrapRange<DayStatsRaw[]>(parseScalar(stats.getBlockStatsJson), false).data ?? []).filter((d) => d.last_height != null);
  if (days.length === 0) return [];
  const blocks = await gqlFetch<{ blocks: { nodes: BlockRaw[] } }>(
    NETWORK,
    BLOCK_SNAPSHOTS,
    { ids: days.map((d) => d.last_height), first: days.length },
    { revalidate },
  );
  const byId = new Map((blocks.blocks?.nodes ?? []).map((b) => [String(b.id), b]));
  return days
    .map((d): SnapshotRaw => ({ date: d.bucket_start, block: byId.get(String(d.last_height))! }))
    .filter((s) => s?.block)
    .map(map)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Most recent daily snapshot (staked actor counts + token totals). */
export async function getLatestSnapshot(): Promise<NetworkSnapshot | null> {
  const { startISO, endISO } = fixedWindow(3 * 86400);
  const snaps = await getSnapshots(startISO, endISO, 3600);
  return snaps.at(-1) ?? null;
}
