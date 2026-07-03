import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK } from '@/lib/app-config';
import { LATEST_BLOCKS_BY_DAY } from '@/lib/queries/analytics';
import { fixedWindow } from '@/lib/timeranges';
import { num, parseScalar } from './_util';

// getLatestBlocksByDay: one denormalized daily block snapshot backs ALL actor-count and staked-POKT
// evolution charts (Network + Suppliers) plus the "serving suppliers" stat. ≤24h stale — label
// snapshot-sourced numbers "as of last daily snapshot".

interface BlockRaw {
  id: number | string;
  timestamp: string;
  staked_validators: number | string;
  staked_suppliers: number | string;
  staked_apps: number | string;
  staked_gateways: number | string;
  unstaking_suppliers: number | string;
  unstaked_suppliers: number | string;
  staked_validators_tokens: number | string;
  staked_suppliers_tokens: number | string;
  staked_apps_tokens: number | string;
  staked_gateways_tokens: number | string;
}

interface SnapshotRaw {
  date: string;
  block: BlockRaw;
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
    stakedValidators: num(b.staked_validators),
    stakedSuppliers: num(b.staked_suppliers),
    stakedApps: num(b.staked_apps),
    stakedGateways: num(b.staked_gateways),
    unstakingSuppliers: num(b.unstaking_suppliers),
    unstakedSuppliers: num(b.unstaked_suppliers),
    validatorTokens: num(b.staked_validators_tokens),
    supplierTokens: num(b.staked_suppliers_tokens),
    appTokens: num(b.staked_apps_tokens),
    gatewayTokens: num(b.staked_gateways_tokens),
  };
}

export async function getSnapshots(startISO: string, endISO: string, revalidate = 3600): Promise<NetworkSnapshot[]> {
  const data = await gqlFetch<{ getLatestBlocksByDay: unknown }>(
    NETWORK,
    LATEST_BLOCKS_BY_DAY,
    { start: startISO, end: endISO },
    { revalidate },
  );
  return parseScalar<SnapshotRaw[]>(data.getLatestBlocksByDay)
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
