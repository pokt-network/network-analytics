import { unstable_cache } from 'next/cache';
import {
  getSupplyHistory,
  getNetInflationPctYr,
  getComposition,
  buildProjection,
  type SupplyPoint,
  type CompSlice,
  type ProjectionPoint,
} from '@/lib/data/economy';
import { diagJson, stamped } from '@/lib/diagnostics';
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
}

export interface EconomyResponse {
  stats: EconomyStats;
  supplyHistory: SupplyPoint[];
  pins: Pin[];
  composition: CompSlice[];
  projection: ProjectionPoint[];
}

// Economy widgets here are long-horizon (supply 1yr, projection 2yr, composition current, net
// inflation 30d), so they don't follow the range pills. Burn vs Mint IS windowed and lives in a
// separate range-aware endpoint (./burnmint). All derived LIVE — no settlement-table precompute.
async function buildEconomy(): Promise<EconomyResponse> {
  const yearWin = fixedWindow(365 * 86400);

  const [supplyHistory, netInflationPctYr, composition] = await Promise.all([
    getSupplyHistory(yearWin.startISO, yearWin.endISO, 6 * 3600),
    getNetInflationPctYr(),
    getComposition(),
  ]);

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
    },
    supplyHistory,
    pins: visible,
    composition,
    projection: buildProjection(supply0),
  };
}

export async function GET() {
  // Economy is long-horizon and derived from several resolvers → cache long; warmer keeps it fresh.
  return diagJson('economy', () =>
    unstable_cache(stamped(() => buildEconomy()), ['economy'], { revalidate: 1800, tags: ['analytics'] })(),
  );
}
