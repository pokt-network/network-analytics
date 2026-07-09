import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import { NETWORK, type RangeKey } from '@/lib/app-config';
import { rangeWindow, rangeTTL } from '@/lib/timeranges';
import { CLAIM_PROOFS_BY_TIME } from '@/lib/queries/analytics';
import { num, parseScalar } from './_util';

// Claims / Proofs / Expired Proofs over time (getClaimProofsDataByTime). Settlement-side, so the
// chart shows CLAIMED computed units (estimated variants also present in the payload).

interface ClaimRaw {
  date: string;
  claim_amount: number | string;
  proof_amount: number | string;
  expired_proof_amount: number | string;
  claim_computed_units: number | string;
  proof_computed_units: number | string;
  expired_proof_computed_units: number | string;
  proof_estimated_computed_units: number | string;
  expired_proof_estimated_computed_units: number | string;
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

export async function getClaimProofs(range: RangeKey): Promise<ClaimProofPoint[]> {
  const w = rangeWindow(range);
  const data = await gqlFetch<{ getClaimProofsDataByTime: unknown }>(
    NETWORK,
    CLAIM_PROOFS_BY_TIME,
    { start: w.startISO, end: w.endISO, interval: w.interval },
    { revalidate: rangeTTL(range) },
  );
  return parseScalar<ClaimRaw[]>(data.getClaimProofsDataByTime)
    .map((r) => ({
      date: toDate(r.date)?.toISOString() ?? r.date,
      claims: num(r.claim_amount),
      proofs: num(r.proof_amount),
      expiredProofs: num(r.expired_proof_amount),
      claimCU: num(r.claim_computed_units),
      proofCU: num(r.proof_computed_units),
      expiredCU: num(r.expired_proof_computed_units),
      provenEstCU: num(r.proof_estimated_computed_units),
      expiredEstCU: num(r.expired_proof_estimated_computed_units),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
