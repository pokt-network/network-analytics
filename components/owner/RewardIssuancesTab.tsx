'use client';

import { useState } from 'react';
import { IconListDetails, IconDownload } from '@tabler/icons-react';
import { UPOKT_PER_POKT } from '@/lib/config';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useCursorPages, walkPages } from '@/lib/cursor-pages';
import type { IssuancePage, Issuance } from '@/lib/data/owner';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { notCovered, rangeNote } from '@/lib/data/coverage';

// CSV export walks the indexer 999 rows at a time (the route's page cap), each page after the previous one's
// cursor (a keyset on height+event index, so rows don't shift between pages). A single owner can have ~1M+
// settlements, so cap the export at the most-recent N — ~5 chunked requests.
const EXPORT_CAP = 5000;
const EXPORT_CHUNK = 999; // the route's largest page
const EXPORT_MAX_CALLS = Math.ceil(EXPORT_CAP / EXPORT_CHUNK) + 1;

// Settlement-event history across the owner's fleet (the suppliers the owners own now). Paged by
// hasNextPage rather than a total: counting every settlement of a large owner takes ~15s. Each page after
// the first reads the rows after the previous page's endCursor (useCursorPages).
export function RewardIssuancesTab() {
  const { addresses } = useStakingTool();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const addrParam = addresses.join(',');
  const issuances = useCursorPages<IssuancePage>(addresses.length ? `/api/owner/issuances?addresses=${addrParam}` : '', addrParam);
  const { page } = issuances;
  const pageRows = issuances.data?.rows.length ?? 0;
  const hasRows = page > 1 || pageRows > 0;
  // the settlement tables can lag the indexed blocks or have gaps: said, never shown as "no settlements"
  const range = issuances.data?.range ?? null;
  const coverageNote = issuances.error ? null : rangeNote(range);

  async function exportIssuancesCsv() {
    if (exporting || addresses.length === 0) return;
    setExporting(true);
    setExportNote(null);
    try {
      const { rows: all, complete } = await walkPages<Issuance>(
        (after) => `/api/owner/issuances?addresses=${addrParam}&pageSize=${EXPORT_CHUNK}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        EXPORT_CAP,
        EXPORT_MAX_CALLS,
      );
      const rows = all.slice(0, EXPORT_CAP);
      const capped = all.length > EXPORT_CAP || !complete;
      // Owner As Of: 'settlement' = the owner the settlement recorded; 'current' = the supplier's owner now, for the
      // few old settlements that recorded none
      const headers = ['Block', 'Service', 'Operator', 'Owner', 'Owner As Of', 'Relays', 'Settled (POKT)', 'Minted (POKT)', 'Mint Ratio'];
      const body = rows.map((r) => [
        r.block,
        r.serviceId,
        r.operator,
        r.owner,
        r.ownerAsOf,
        r.relays,
        r.settledUpokt / UPOKT_PER_POKT,
        r.mintedUpokt / UPOKT_PER_POKT,
        r.mintRatio,
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
              {['Block', 'Service', 'Operator', 'Relays', 'Settled', 'Minted', 'Ratio'].map((h, i) => {
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
              </tr>
            ))}
            {issuances.error && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-text-tertiary">{issuances.error}</td>
              </tr>
            )}
            {issuances.data && pageRows === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-text-tertiary">{notCovered(range) ? 'No settlements indexed yet.' : 'No settlements found.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
        <span>page {formatNumber(page)}</span>
        <div className="flex gap-1.5">
          <button type="button" disabled={page <= 1} onClick={issuances.prev} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
          <button type="button" disabled={!issuances.canNext} onClick={issuances.next} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
        </div>
      </div>
      {coverageNote && !notCovered(range) && <p className="mt-3 text-[12px] text-text-tertiary">Settlements indexed: {coverageNote}</p>}
      {exportNote && <p className="mt-3 text-[12px] text-text-secondary">{exportNote}</p>}
      <p className="mt-3 text-[12px] italic text-text-tertiary">
        Each row is a settlement event, not a transaction (the chain settles claims at the end of a block) — the Operator is the node that settled it.
      </p>
    </Card>
  );
}
