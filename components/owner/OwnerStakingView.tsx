'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconWallet, IconListCheck, IconCoin, IconReceipt, IconUsers, IconPercentage, IconChartLine, IconListDetails, IconExternalLink } from '@tabler/icons-react';
import { EXPLORER_BASE_URL, OWNER_ADDRESS_CAP, SERIES_COLORS, NETWORK_TOTAL_COLOR, type RangeKey } from '@/lib/app-config';
import { loadAddresses, saveAddresses, parseAddressInput } from '@/lib/owner-storage';
import { useTabData } from '@/lib/use-tab-data';
import type { OwnerResponse } from '@/app/api/owner/route';
import type { IssuancePage } from '@/lib/data/owner';
import { formatNumber, formatCompact, formatPokt, truncate } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { RangePills } from '@/components/dashboard/RangePills';
import { TimeSeriesChart, type SeriesDef } from '@/components/charts/TimeSeriesChart';
import { ChartSkeleton, EmptyState } from '@/components/ui/states';

const PAGE_SIZE = 25;

export function OwnerStakingView() {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [dropped, setDropped] = useState(0);
  const [range, setRange] = useState<RangeKey>('7d');
  const [groupAll, setGroupAll] = useState(false);
  const [page, setPage] = useState(1);

  // Hydrate from localStorage after mount. This is a deliberate external-store sync (localStorage
  // isn't available during SSR, so a lazy initializer would cause a hydration mismatch).
  useEffect(() => {
    const saved = loadAddresses();
    if (saved.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddresses(saved);
      setInput(saved.join('\n'));
    }
  }, []);

  const addrParam = addresses.join(',');
  const rewards = useTabData<OwnerResponse>(addresses.length ? `/api/owner?addresses=${addrParam}&range=${range}&group=${groupAll ? 1 : 0}` : '');
  const issuances = useTabData<IssuancePage>(addresses.length ? `/api/owner/issuances?addresses=${addrParam}&page=${page}` : '');

  function apply() {
    const { valid, invalid } = parseAddressInput(input);
    setAddresses(valid);
    saveAddresses(valid);
    setDropped(invalid.length);
    setPage(1);
  }
  function clearAll() {
    setAddresses([]);
    setInput('');
    saveAddresses([]);
    setDropped(0);
  }

  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    addresses.forEach((a, i) => m.set(a, SERIES_COLORS[i % SERIES_COLORS.length]));
    return m;
  }, [addresses]);

  const chartSeries: SeriesDef[] = groupAll
    ? [{ key: 'total', color: NETWORK_TOTAL_COLOR, label: 'All addresses' }]
    : addresses.map((a) => ({ key: a, color: colorFor.get(a)!, label: truncate(a, 8, 5) }));

  const totalCount = issuances.data?.totalCount ?? 0;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const avgMintRatio = issuances.data?.rows?.[0]?.mintRatio ?? null;

  return (
    <>
      <div className="mb-[18px] flex items-center gap-2.5">
        <IconWallet size={22} className="text-blue-soft" />
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.2px]">Owner Staking</h1>
          <p className="text-[15px] text-text-secondary">Track rewards for your addresses — performance, not provenance</p>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader title="Track Addresses" icon={<IconListCheck size={18} />} right={<span className="text-[12px] text-text-tertiary">saved to this browser</span>} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'Paste one or more addresses (comma or line separated)\npokt1…'}
          className="min-h-[96px] w-full resize-y rounded-[10px] border bg-bg-card p-3.5 font-mono text-[13px] text-text-primary outline-none focus:border-blue"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={apply} className="rounded-[9px] bg-blue px-[18px] py-2.5 text-sm font-medium text-white hover:bg-[#0148c4]">
            View Rewards
          </button>
          <button type="button" onClick={clearAll} className="rounded-[9px] border bg-bg-card px-[18px] py-2.5 text-sm font-medium text-text-secondary hover:border-line-hover hover:text-text-primary">
            Clear
          </button>
          <span className="text-[12px] text-text-tertiary">
            {addresses.length} / {OWNER_ADDRESS_CAP} addresses
          </span>
          {dropped > 0 && <span className="text-[12px] text-coral">{dropped} invalid entr{dropped === 1 ? 'y' : 'ies'} dropped</span>}
        </div>
        {addresses.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {addresses.map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5 rounded-md border bg-bg-surface px-2.5 py-1 font-mono text-[12px] text-text-secondary">
                <span className="h-2 w-2 rounded-sm" style={{ background: colorFor.get(a) }} />
                {truncate(a, 8, 5)}
              </span>
            ))}
          </div>
        )}
      </Card>

      {addresses.length === 0 ? (
        <EmptyState>Add one or more <span className="font-mono">pokt1…</span> owner addresses to see rewards and settlement history.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label={`Total Rewards (${range})`} value={rewards.data ? formatCompact(rewards.data.totalPokt) : '—'} unit="POKT" icon={<IconCoin size={15} />} iconColor="var(--mint)" />
            <StatCard label="Settlements" value={formatNumber(totalCount)} icon={<IconReceipt size={15} />} iconColor="var(--blue-soft)" sub="all-time" />
            <StatCard label="Tracked Addresses" value={formatNumber(addresses.length)} icon={<IconUsers size={15} />} iconColor="var(--lavender)" />
            <StatCard label="Mint Ratio" value={avgMintRatio != null ? avgMintRatio.toFixed(3) : '—'} icon={<IconPercentage size={15} />} iconColor="var(--gold)" sub="latest settlement" />
          </div>

          <Card className="mb-4">
            <CardHeader
              title="Rewards Over Time"
              icon={<IconChartLine size={18} />}
              right={
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setGroupAll((g) => !g)}
                    className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium ${groupAll ? 'border-blue bg-[rgba(2,90,242,.1)] text-blue-soft' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    Group All
                  </button>
                  <RangePills value={range} onChange={setRange} />
                </div>
              }
            />
            {!rewards.data ? (
              <ChartSkeleton height={280} />
            ) : rewards.data.rewards.rows.length === 0 ? (
              <EmptyState>No rewards in this window.</EmptyState>
            ) : (
              <TimeSeriesChart data={rewards.data.rewards.rows} series={chartSeries} interval={range === '24h' ? 'hour' : 'day'} height={280} />
            )}
          </Card>

          <Card>
            <CardHeader title="Reward Issuances" icon={<IconListDetails size={18} />} tag="settlement events" />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    {['Block', 'Service', 'Address', 'Relays', 'Settled', 'Minted', 'Ratio', ''].map((h, i) => (
                      <th key={h || i} className={`border-b px-3 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary ${i >= 3 && i <= 6 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issuances.data?.rows.map((r, i) => (
                    <tr key={`${r.block}-${r.serviceId}-${i}`} className="hover:bg-bg-card-hover">
                      <td className="border-b px-3 py-3 font-mono">{formatNumber(r.block)}</td>
                      <td className="border-b px-3 py-3 font-medium text-blue-soft">{r.serviceId}</td>
                      <td className="border-b px-3 py-3 font-mono text-text-secondary">{truncate(r.owner, 8, 4)}</td>
                      <td className="border-b px-3 py-3 text-right tabular-nums">{formatNumber(r.relays)}</td>
                      <td className="border-b px-3 py-3 text-right tabular-nums">{formatPokt(r.settledUpokt)}</td>
                      <td className="border-b px-3 py-3 text-right tabular-nums">{formatPokt(r.mintedUpokt)}</td>
                      <td className="border-b px-3 py-3 text-right tabular-nums">{r.mintRatio.toFixed(3)}</td>
                      <td className="border-b px-3 py-3 text-right">
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
                  {issuances.data && issuances.data.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-text-tertiary">No settlements found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
              <span>{formatNumber(totalCount)} settlements · page {page} of {formatNumber(pages)}</span>
              <div className="flex gap-1.5">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Prev</button>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border bg-bg-card px-3 py-1.5 disabled:opacity-40 hover:enabled:border-line-hover">Next</button>
              </div>
            </div>
            <p className="mt-3 text-[12px] italic text-text-tertiary">
              Each row is a settlement event, not a transaction. The ↗ link opens the underlying tx in the Explorer — the only crossover point.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
