import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK } from '@/lib/app-config';
import { REWARDS_BY_DATE } from '@/lib/queries/analytics';
import { fixedWindow } from '@/lib/timeranges';
import { num, parseScalar } from './_util';

// Network-wide rewards/relays/CU over time (getRewardsByDate). Backs the Network-wide series and
// the Traffic 24h stat deltas. Both claimed and estimated present; caller picks which to show.

interface RewardRaw {
  date_truncated: string;
  relays: number | string;
  estimated_relays: number | string;
  computed_units: number | string;
  estimated_computed_units: number | string;
  claimed_amount: number | string;
}

export interface RewardPoint {
  date: string; // ISO, UTC (Z-appended)
  relays: number;
  estimatedRelays: number;
  computedUnits: number;
  estimatedComputedUnits: number;
  claimedAmount: number; // upokt
}

export async function getRewardsByDate(
  startISO: string,
  endISO: string,
  interval: 'hour' | 'day' | 'week',
  revalidate = 300,
): Promise<RewardPoint[]> {
  const data = await gqlFetch<{ getRewardsByDate: unknown }>(
    NETWORK,
    REWARDS_BY_DATE,
    { start: startISO, end: endISO, interval },
    { revalidate },
  );
  const raw = parseScalar<RewardRaw[]>(data.getRewardsByDate);
  return raw
    .map((r) => ({
      date: toDate(r.date_truncated)?.toISOString() ?? r.date_truncated,
      relays: num(r.relays),
      estimatedRelays: num(r.estimated_relays),
      computedUnits: num(r.computed_units),
      estimatedComputedUnits: num(r.estimated_computed_units),
      claimedAmount: num(r.claimed_amount),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface Rolling24h {
  relays24h: number;
  relays24hChange: number;
  cu24h: number;
  cu24hChange: number;
}

/** Trailing 24h vs prior 24h, summed from hourly buckets (estimated = demand signal).
 *  Shared by the Traffic stat cards and the live strip. */
export async function getRolling24hStats(): Promise<Rolling24h> {
  const { startISO, endISO } = fixedWindow(48 * 3600);
  const pts = await getRewardsByDate(startISO, endISO, 'hour', 60);
  const cut = Date.now() - 24 * 3600 * 1000;
  let cuCur = 0, cuPrev = 0, rCur = 0, rPrev = 0;
  for (const p of pts) {
    const t = Date.parse(p.date);
    if (t >= cut) {
      cuCur += p.estimatedComputedUnits;
      rCur += p.estimatedRelays;
    } else {
      cuPrev += p.estimatedComputedUnits;
      rPrev += p.estimatedRelays;
    }
  }
  const pct = (c: number, p: number) => (p > 0 ? ((c - p) / p) * 100 : 0);
  return {
    relays24h: rCur,
    relays24hChange: pct(rCur, rPrev),
    cu24h: cuCur,
    cu24hChange: pct(cuCur, cuPrev),
  };
}
