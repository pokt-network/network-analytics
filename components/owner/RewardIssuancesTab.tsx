'use client';

import { useState } from 'react';
import { IconListDetails, IconExternalLink, IconDownload } from '@tabler/icons-react';
import { EXPLORER_BASE_URL } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { IssuancePage, Issuance } from '@/lib/data/owner';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';

// CSV export walks the indexer 1000 rows at a time (its page cap), each page after the previous one's
// cursor (a keyset on block+id, so rows don't shift between pages). A single owner can have ~1M+
// settlements, so cap the export at the most-recent N — ~5 chunked requests.
const EXPORT_CAP = 5000;
const EXPORT_CHUNK = 1000;

// Settlement-event history across the owner's fleet. Filtered through the supplier relation
// (supplier.ownerId), so rows are complete — the denormalized supplierOwnerId under-reports. Paged by
// hasNextPage rather than a total: counting every settlement of a large owner takes ~15s.
export function RewardIssuancesTab() {
  const { addresses } = useStakingTool();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const addrParam = addresses.join(',');
  const [prevAddr, setPrevAddr] = useState(addrParam);
  if (prevAddr !== addrParam) {
    setPrevAddr(addrParam);
    setPage(1);
  }

  const issuances = useTabData<IssuancePage>(addresses.length ? `/api/owner/issuances?addresses=${addrParam}&page=${page}` : '');
  const pageRows = issuances.data?.rows.length ?? 0;
  const hasNext = issuances.data?.hasNextPage ?? false;
  const hasRows = page > 1 || pageRows > 0;

  async function exportIssuancesCsv() {
    if (exporting || addresses.length === 0) return;
    setExporting(true);
    setExportNote(null);
    try {
      const all: Issuance[] = [];
      let after: string | null = null;
      let more = true;
      while (more && all.length < EXPORT_CAP) {
        const next = after ? `&after=${encodeURIComponent(after)}` : '';
        const res = await fetch(`/api/owner/issuances?addresses=${addrParam}&pageSize=${EXPORT_CHUNK}${next}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IssuancePage = await res.json();
        all.push(...data.rows);
        more = data.hasNextPage && !!data.endCursor;
        after = data.endCursor ?? null;
      }
      const rows = all.slice(0, EXPORT_CAP);
      const capped = all.length > EXPORT_CAP || (more && all.length >= EXPORT_CAP);
      const headers = ['Block', 'Service', 'Operator', 'Owner', 'Relays', 'Settled (POKT)', 'Minted (POKT)', 'Mint Ratio', 'Transaction'];
      const body = rows.map((r) => [
        r.block,
        r.serviceId,
        r.operator,
        r.owner,
        r.relays,
        r.settledUpokt / UPOKT_PER_POKT,
        r.mintedUpokt / UPOKT_PER_POKT,
        r.mintRatio,
        r.transactionId ?? '',
      ]);
      downloadCsv(csvFilename('reward-issuances'), toCsv(headers, body));
      setExportNote(
        capped
          ? `Exported the ${formatNumber(rows.length)} most recent settlements — the export is capped for performance.`
          : `Exported all ${formatNumber(rows.length)} settlements.`,
      );
    } catch {
      setExportNote('Export failed — please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Reward Issuances"
        icon={<IconListDetails size={18} />}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <span className="rounded-md border px-2 py-0.5 text-[11px] text-text-secondary">settlement events</span>
            <button
              type="button"
              onClick={exportIssuancesCsv}
              disabled={exporting || !hasRows}
              title={!hasRows ? 'No settlements to download' : exporting ? 'Preparing CSV…' : `Download up to ${formatNumber(EXPORT_CAP)} most recent settlements as CSV`}
              aria-label="Download CSV"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconDownload size={15} className={exporting ? 'animate-pulse' : ''} />
            </button>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Block', 'Service', 'Operator', 'Relays', 'Settled', 'Minted', 'Ratio', ''].map((h, i) => {
                const hideOnMobile = i === 2 || i === 3 || i === 4 || i === 6;
                return (
                  <th
                    key={h || i}
                    className={`border-b px-1.5 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary sm:px-3 ${i >= 3 && i <= 6 ? 'text-right' : 'text-left'} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                  >
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {issuances.data?.rows.map((r, i) => (
              <tr key={`${r.block}-${r.operator}-${r.serviceId}-${i}`} className="hover:bg-bg-card-hover">
                <td className="border-b px-1.5 py-3 font-mono sm:px-3">{formatNumber(r.block)}</td>
                <td className="border-b px-1.5 py-3 font-medium text-blue-soft sm:px-3">{r.serviceId}</td>
                <td className="hidden border-b px-1.5 py-3 font-mono text-text-secondary sm:table-cell sm:px-3" title={r.operator}>{truncate(r.operator, 8, 4)}</td>
                <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatNumber(r.relays)}</td>
                <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatPokt(r.settledUpokt)}</td>
                <td className="border-b px-1.5 py-3 text-right tabular-nums sm:px-3">{formatPokt(r.mintedUpokt)}</td>
                <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{r.mintRatio.toFixed(3)}</td>
                <td className="border-b px-1.5 py-3 text-right sm:px-3">
                  {r.transactionId ? (
                    <a href={`${EXPLORER_BASE_URL}/tx/${r.transactionId}`} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-blue-soft" title="Open tx in Explorer">
                      <IconExternalLink size={15} />
                    </a>
                  ) : (
                    <span className="text-text-tertiary" title="No linked transaction">—</span>
                  )}
                </td>
              </tr>
            ))}
            {issuances.data && pageRows === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-text-tertiary">No settlements found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
        <span>page {formatNumber(page)}</span>
        <div className="flex gap-1.5">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
          <button type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
        </div>
      </div>
      {exportNote && <p className="mt-3 text-[12px] text-text-secondary">{exportNote}</p>}
      <p className="mt-3 text-[12px] italic text-text-tertiary">
        Each row is a settlement event, not a transaction — the Operator is the node that settled it. The ↗ link opens the underlying tx in the Explorer.
      </p>
    </Card>
  );
}
