'use client';

import { useState } from 'react';
import { IconReceipt, IconDownload } from '@tabler/icons-react';
import { EXPLORER_BASE_URL } from '@/lib/app-config';
import { UPOKT_PER_POKT } from '@/lib/config';
import { useStakingTool } from '@/components/staking/StakingToolContext';
import { useCursorPages, walkPages } from '@/lib/cursor-pages';
import type { SlashPage, SlashRow } from '@/lib/data/operator';
import { Card, CardHeader } from '@/components/ui/Card';
import { ChartSkeleton, EmptyState } from '@/components/ui/states';
import { rangeNote } from '@/lib/data/coverage';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';

const PAGE_SIZE = 25;
const EXPORT_CAP = 5000;
const EXPORT_CHUNK = 1000; // the route's largest export page (lookahead=0: no extra row, stops at a short page)
const EXPORT_MAX_CALLS = Math.ceil(EXPORT_CAP / EXPORT_CHUNK) + 1;

// Supplier slashing events (proof-missing penalties) for the operator's suppliers, in the view's range. Paged by keyset
// on the server (useCursorPages); the range's count and penalty sum come with every page, computed once per range.
export function SlashingTab() {
  const { addresses, range } = useStakingTool();
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const addrParam = addresses.join(',');
  const query = `addresses=${addrParam}&range=${range}`;
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setExportNote(null);
  }

  // every range is a heavy read on the indexer: no sibling-range prefetch
  const d = useCursorPages<SlashPage>(addresses.length ? `/api/operator/slashing?${query}` : '', query, { prefetchSiblings: false });
  const { page } = d;
  const totalCount = d.data?.totalCount ?? 0;
  // the count is a floor when part of the range could only be counted up to a cap
  const atLeast = d.data?.capped ? 'at least ' : '';
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE), page + (d.canNext ? 1 : 0));
  const noRows = page === 1 && (d.data?.rows.length ?? 0) === 0;
  // what the indexed blocks cover of the range: a short coverage is said, never shown as a plain 0
  const coverageNote = d.error ? null : rangeNote(d.data?.range ?? null, range === '24h' ? 'hour' : 'day');

  async function exportCsv() {
    if (exporting || addresses.length === 0) return;
    setExporting(true);
    setExportNote(null);
    try {
      const { rows: all, complete } = await walkPages<SlashRow>(
        // the server pins the window with the first page; walkPages sends it back with every later page and the probe
        (after, size) => `/api/operator/slashing?${query}&lookahead=0&pageSize=${size}${after ? `&after=${encodeURIComponent(after)}` : ''}`,
        EXPORT_CHUNK,
        EXPORT_CAP,
        EXPORT_MAX_CALLS,
        // at the cap on a full page, 1 row past the last cursor tells whether the export is complete
        true,
      );
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
        complete
          ? `Exported all ${formatNumber(rows.length)} slashing events.`
          : `Exported the ${formatNumber(rows.length)} most recent slashing events — the export is capped for performance.`,
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
      {d.error ? (
        <>
          <EmptyState>{d.error}</EmptyState>
          {/* a failed page keeps the way back */}
          <div className="mt-3.5 flex justify-end gap-1.5 text-[13px] text-text-secondary">
            <button type="button" disabled={page <= 1} onClick={d.prev} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
            <button type="button" disabled onClick={d.next} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
          </div>
        </>
      ) : !d.data ? (
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
              {atLeast}{formatNumber(totalCount)} slashing events in the last {range} · {atLeast}{formatPokt(d.data.penaltyUpokt, 6)} POKT in penalties · page {page} of{' '}
              {formatNumber(pages)}
            </span>
            <div className="flex gap-1.5">
              <button type="button" disabled={page <= 1} onClick={d.prev} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
              <button type="button" disabled={!d.canNext} onClick={d.next} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
            </div>
          </div>
        </>
      )}
      {coverageNote && !noRows && d.data?.indexed && <p className="mt-3 text-[12px] text-text-tertiary">{coverageNote}</p>}
      <p className="mt-3 text-[12px] italic text-text-tertiary">
        Lists the suppliers that are Staked and share revenue with these addresses now: slashes of suppliers that have since
        unstaked or stopped sharing revenue with them are not listed yet.
      </p>
      {exportNote && <p className="mt-3 text-[12px] text-text-secondary">{exportNote}</p>}
    </Card>
  );
}
