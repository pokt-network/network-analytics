import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import {
  getSupplyHistory,
  getNetInflationPctYr,
  getMintRatio,
  getBurnMint,
  getComposition,
  buildProjection,
  type SupplyPoint,
  type BurnMintPoint,
  type CompSlice,
  type ProjectionPoint,
} from '@/lib/data/economy';
import { fixedWindow } from '@/lib/timeranges';
import supplyEventsRaw from '@/data/supply-events.json';

interface Pin {
  date: string;
  label: string;
  description: string;
}
const PINS = supplyEventsRaw as Pin[];

export interface EconomyStats {
  netInflationPctYr: number;
  totalSupplyPokt: number;
  burn7dPokt: number;
  mint7dPokt: number;
  mintRatio: number;
}

export interface EconomyResponse {
  stats: EconomyStats;
  supplyHistory: SupplyPoint[];
  pins: Pin[];
  composition: CompSlice[];
  burnMint: BurnMintPoint[];
  projection: ProjectionPoint[];
}

// Economy widgets are long-horizon (supply 1yr, burn/mint 7d, projection 2yr, composition current),
// so they don't follow the range pills. All derived LIVE — no settlement-table precompute (gross
// mint/burn = Σclaimed × mint_ratio; net inflation = total_supply delta).
async function buildEconomy(): Promise<EconomyResponse> {
  const mintRatio = await getMintRatio();
  const yearWin = fixedWindow(365 * 86400);
  const week = fixedWindow(7 * 86400);

  const [supplyHistory, netInflationPctYr, composition, burnMint7d] = await Promise.all([
    getSupplyHistory(yearWin.startISO, yearWin.endISO, 6 * 3600),
    getNetInflationPctYr(),
    getComposition(),
    getBurnMint(week.startISO, week.endISO, 'day', mintRatio, 300),
  ]);

  const burn7dPokt = burnMint7d.reduce((s, p) => s + p.burnPokt, 0);
  const mint7dPokt = burnMint7d.reduce((s, p) => s + p.mintPokt, 0);
  const supply0 = supplyHistory.at(-1)?.totalSupplyPokt ?? 0;

  // Pins within the visible (1yr) window, matched to the nearest supply bucket for chart placement.
  const visible = PINS.filter((p) => {
    const t = Date.parse(`${p.date}T00:00:00Z`);
    return t >= Date.parse(yearWin.startISO) && t <= Date.parse(yearWin.endISO);
  });

  return {
    stats: {
      netInflationPctYr,
      totalSupplyPokt: supply0,
      burn7dPokt,
      mint7dPokt,
      mintRatio,
    },
    supplyHistory,
    pins: visible,
    composition,
    burnMint: burnMint7d,
    projection: buildProjection(supply0),
  };
}

export async function GET() {
  // Economy is long-horizon and derived from several resolvers → cache long; warmer keeps it fresh.
  const payload = await unstable_cache(() => buildEconomy(), ['economy'], { revalidate: 1800, tags: ['analytics'] })();
  return NextResponse.json(payload);
}
