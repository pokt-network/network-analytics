'use client';

import { useState } from 'react';
import { IconReceipt, IconDownload } from '@tabler/icons-react';
import { EXPLORER_BASE_URL } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useTabData } from '@/lib/use-tab-data';
import type { SlashPage, SlashRow } from '@/lib/data/operator';
import { Card, CardHeader } from '@/components/ui/Card';
import { ChartSkeleton, EmptyState } from '@/components/ui/states';
import { rangeNote } from '@/lib/data/coverage';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';

const PAGE_SIZE = 25;
const EXPORT_CAP = 5000;
const EXPORT_CHUNK = 999; // the route's largest page
const EXPORT_MAX_CALLS = Math.ceil(EXPORT_CAP / EXPORT_CHUNK) + 1;

// Supplier slashing events (proof-missing penalties) for the operator's suppliers, in the view's range. Each page
// after the first reads the rows after the previous page's endCursor; cursors[i] is the one page i + 1 starts after.
export function SlashingTab() {
  const { addresses, range } = useStakingTool();
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const addrParam = addresses.join(',');
  const query = `addresses=${addrParam}&range=${range}`;
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setPage(1);
    setCursors([]);
  }

  const pageAfter = page > 1 ? `&after=${encodeURIComponent(cursors[page - 2] ?? '')}` : '';
  const d = useTabData<SlashPage>(addresses.length ? `/api/operator/slashing?${query}${pageAfter}` : '');
  const totalCount = d.data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const endCursor = d.data?.endCursor ?? null;
  const hasNext = (d.data?.hasNextPage ?? false) && !!endCursor;
  const noRows = page === 1 && (d.data?.rows.length ?? 0) === 0;
  // the totals cover only what the settlement tables have written: a short coverage is said, never shown as a plain 0
  const coverageNote = d.error ? null : rangeNote(d.data?.range ?? null, range === '24h' ? 'hour' : 'day');

  async function exportCsv() {
    if (exporting || addresses.length === 0) return;
    setExporting(true);
    setExportNote(null);
    try {
      const all: SlashRow[] = [];
      let after: string | null = null;
      let total = 0;
      let totalMoved = false;
      let more = true;
      for (let calls = 0; more && all.length < EXPORT_CAP && calls < EXPORT_MAX_CALLS; calls++) {
        const next = after ? `&after=${encodeURIComponent(after)}` : '';
        const res = await fetch(`/api/operator/slashing?${query}&pageSize=${EXPORT_CHUNK}${next}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SlashPage = await res.json();
        if (!after) total = data.totalCount ?? 0;
        else if ((data.totalCount ?? 0) !== total) totalMoved = true;
        all.push(...data.rows);
        more = (data.hasNextPage ?? false) && !!data.endCursor;
        after = data.endCursor ?? null;
      }
      const rows = all.slice(0, EXPORT_CAP);
      const headers = ['Supplier', 'Block', 'Penalty (POKT)', 'Prev Stake (POKT)', 'After Stake (POKT)', 'Proof Status', 'Service', 'Application'];
      const body = rows.map((r) => [
        r.supplier,
        r.block,
        r.penaltyUpokt / UPOKT_PER_POKT,
        r.prevStakeUpokt / UPOKT_PER_POKT,
        r.afterStakeUpokt / UPOKT_PER_POKT,
        r.proofStatus ?? '',
        r.serviceId ?? '',
        r.applicationId ?? '',
      ]);
      downloadCsv(csvFilename('operator-slashing'), toCsv(headers, body));
      setExportNote(
        totalMoved
          ? `Exported ${formatNumber(rows.length)} slashing events, but the range's count changed during the export: download again.`
          : rows.length === total
            ? `Exported all ${formatNumber(rows.length)} slashing events.`
            : all.length >= EXPORT_CAP || more
              ? `Exported the ${formatNumber(rows.length)} most recent of ${formatNumber(total)} slashing events — the export is capped for performance.`
              : `Exported ${formatNumber(rows.length)} slashing events, but the range counts ${formatNumber(total)}: the list may be incomplete.`,
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
        title="Slashing"
        icon={<IconReceipt size={18} />}
        right={
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || noRows}
            aria-label="Download CSV"
            title={noRows ? 'Nothing to download' : 'Download as CSV'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload size={15} className={exporting ? 'animate-pulse' : ''} />
          </button>
        }
      />
      {!d.data ? (
        <ChartSkeleton height={200} />
      ) : !d.data.indexed ? (
        <EmptyState>The indexer has not reached the last {range} yet.</EmptyState>
      ) : noRows ? (
        <EmptyState>
          {coverageNote
            ? `No slashing events for these addresses in the indexed part of the last ${range} (${coverageNote}).`
            : `No slashing events for these addresses in the last ${range}.`}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Supplier', 'Block', 'Penalty', 'Prev Stake', 'After Stake', 'Proof', 'Service'].map((h, i) => {
                    const hideOnMobile = i === 3 || i === 4 || i === 5;
                    return (
                      <th key={h} className={`border-b px-1.5 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary sm:px-3 ${i >= 2 && i <= 4 ? 'text-right' : 'text-left'} ${hideOnMobile ? 'hidden sm:table-cell' : ''}`}>
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {d.data.rows.map((r, i) => (
                  <tr key={`${r.block}-${r.supplier}-${i}`} className="hover:bg-bg-card-hover">
                    <td className="border-b px-1.5 py-3 font-mono text-text-secondary sm:px-3" title={r.supplier}>
                      <a href={`${EXPLORER_BASE_URL}/account/${r.supplier}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-soft">
                        {truncate(r.supplier, 8, 4)}
                      </a>
                    </td>
                    <td className="border-b px-1.5 py-3 font-mono sm:px-3">{formatNumber(r.block)}</td>
                    <td className="border-b px-1.5 py-3 text-right tabular-nums text-coral sm:px-3">{formatPokt(r.penaltyUpokt, 6)} POKT</td>
                    <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatPokt(r.prevStakeUpokt)} POKT</td>
                    <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatPokt(r.afterStakeUpokt)} POKT</td>
                    <td className="hidden border-b px-1.5 py-3 sm:table-cell sm:px-3">{r.proofStatus ?? '—'}</td>
                    <td className="border-b px-1.5 py-3 font-medium text-blue-soft sm:px-3">{r.serviceId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
            <span>
              {formatNumber(totalCount)} slashing events in the last {range} · {formatPokt(d.data.penaltyUpokt, 6)} POKT in penalties · page {page} of{' '}
              {formatNumber(pages)}
            </span>
            <div className="flex gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
              <button type="button" disabled={!hasNext} onClick={() => { setCursors((c) => [...c.slice(0, page - 1), endCursor!]); setPage((p) => p + 1); }} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
            </div>
          </div>
        </>
      )}
      {coverageNote && !noRows && d.data?.indexed && <p className="mt-3 text-[12px] text-text-tertiary">Totals: {coverageNote}</p>}
      {exportNote && <p className="mt-3 text-[12px] text-text-secondary">{exportNote}</p>}
    </Card>
  );
}
