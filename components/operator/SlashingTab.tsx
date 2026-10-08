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
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { toCsv, downloadCsv, csvFilename } from '@/lib/csv';

const PAGE_SIZE = 25;
const EXPORT_CAP = 5000;
const EXPORT_CHUNK = 100;

// Supplier slashing events (proof-missing penalties) for the operator's suppliers.
export function SlashingTab() {
  const { addresses } = useStakingTool();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const addrParam = addresses.join(',');
  const [prevAddr, setPrevAddr] = useState(addrParam);
  if (prevAddr !== addrParam) {
    setPrevAddr(addrParam);
    setPage(1);
  }

  const d = useTabData<SlashPage>(addresses.length ? `/api/operator/slashing?addresses=${addrParam}&page=${page}` : '');
  const totalCount = d.data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function exportCsv() {
    if (exporting || addresses.length === 0) return;
    setExporting(true);
    try {
      const all: SlashRow[] = [];
      let p = 1;
      let total = Infinity;
      while (all.length < total && all.length < EXPORT_CAP) {
        const res = await fetch(`/api/operator/slashing?addresses=${addrParam}&page=${p}&pageSize=${EXPORT_CHUNK}`);
        if (!res.ok) break;
        const data: SlashPage = await res.json();
        total = data.totalCount ?? 0;
        all.push(...data.rows);
        if (data.rows.length === 0) break;
        p++;
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
            disabled={exporting || totalCount === 0}
            aria-label="Download CSV"
            title={totalCount === 0 ? 'Nothing to download' : 'Download as CSV'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:enabled:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconDownload size={15} className={exporting ? 'animate-pulse' : ''} />
          </button>
        }
      />
      {!d.data ? (
        <>
          <ChartSkeleton height={200} />
          <p className="mt-3 text-center text-[12px] text-text-tertiary">
            First load scans slashing events across your suppliers — this can take a few seconds.
          </p>
        </>
      ) : totalCount === 0 ? (
        <EmptyState>No slashing events for these addresses.</EmptyState>
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
                    <td className="border-b px-1.5 py-3 text-right tabular-nums text-coral sm:px-3">{formatPokt(r.penaltyUpokt)}</td>
                    <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatPokt(r.prevStakeUpokt)}</td>
                    <td className="hidden border-b px-1.5 py-3 text-right tabular-nums sm:table-cell sm:px-3">{formatPokt(r.afterStakeUpokt)}</td>
                    <td className="hidden border-b px-1.5 py-3 sm:table-cell sm:px-3">{r.proofStatus ?? '—'}</td>
                    <td className="border-b px-1.5 py-3 font-medium text-blue-soft sm:px-3">{r.serviceId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
            <span>{formatNumber(totalCount)} slashing events · page {page} of {formatNumber(pages)}</span>
            <div className="flex gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
