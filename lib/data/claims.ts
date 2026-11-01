import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { NETWORK_CLAIMS } from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';
import { unwrapRange } from './coverage';

// Claims / Proofs / Expired Proofs over time (getNetworkClaimsJson; its settled_* are the proofs). Settlement-side, so the
// chart shows CLAIMED computed units (estimated variants also present in the payload).

interface ClaimRaw {
  bucket_start: string;
  claims: number | string;
  settled_claims: number | string;
  expired_claims: number | string;
  claimed_compute_units: number | string;
  settled_compute_units: number | string;
  expired_compute_units: number | string;
  settled_estimated_compute_units: number | string;
  expired_estimated_compute_units: number | string;
}

export interface ClaimProofPoint {
  date: string;
  claims: number; // count
  proofs: number;
  expiredProofs: number;
  claimCU: number; // raw claimed CU — can include unproven over-claims; not charted (see NetworkTab)
  proofCU: number;
  expiredCU: number;
  // Estimated (difficulty-scaled) proven/expired CU — the true *settled* throughput, matching the
  // Traffic demand signal. Charted instead of raw claims so unsettled over-claims don't distort it.
  provenEstCU: number;
  expiredEstCU: number;
}

export async function getClaimProofs(range: RangeKey, now?: number): Promise<ClaimProofPoint[]> {
  const w = rangeWindow(range, now);
  const data = await gqlFetch<{ getNetworkClaimsJson: unknown }>(
    NETWORK,
    NETWORK_CLAIMS,
    { start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  // a bucket the indexer does not cover has no row (not a zero), as before
  return (unwrapRange<ClaimRaw[]>(parseScalar(data.getNetworkClaimsJson), false).data ?? [])
    .map((r) => ({
      date: toDate(r.bucket_start)?.toISOString() ?? r.bucket_start,
      claims: num(r.claims),
      proofs: num(r.settled_claims),
      expiredProofs: num(r.expired_claims),
      claimCU: num(r.claimed_compute_units),
      proofCU: num(r.settled_compute_units),
      expiredCU: num(r.expired_compute_units),
      provenEstCU: num(r.settled_estimated_compute_units),
      expiredEstCU: num(r.expired_estimated_compute_units),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
