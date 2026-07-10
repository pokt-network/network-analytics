'use client';

import { useEffect, useState } from 'react';
import { formatNumber, formatCompact } from '@/lib/format';
import type { LivePayload } from '@/app/api/live/route';

const POLL_MS = 15_000;

function fmtPrice(p: number): string {
  return p < 1 ? `$${p.toFixed(6)}` : `$${p.toFixed(2)}`;
}

export function LiveStrip() {
  const [data, setData] = useState<LivePayload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    let ctrl: AbortController | null = null;
    async function poll() {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch('/api/live', { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('bad status');
        const json = (await res.json()) as LivePayload;
        if (!active) return;
        setData(json);
        setErr(false);
      } catch (e) {
        if (active && (e as Error)?.name !== 'AbortError') setErr(true);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      ctrl?.abort();
      clearInterval(id);
    };
  }, []);

  // Sync badge state
  let dotColor = 'var(--text-tertiary)';
  let label = 'Syncing';
  if (data && !err) {
    if (data.healthy) {
      dotColor = 'var(--mint)';
      label = 'Synced';
    } else {
      dotColor = 'var(--gold)';
      label = data.lag != null ? `Lag ${data.lag}` : 'Lagging';
    }
  } else if (err) {
    dotColor = 'var(--coral)';
    label = 'Offline';
  }

  const price = data?.price ?? null;

  return (
    <div className="border-b bg-bg-card">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-[9px] text-[13px] sm:px-6">
        <span className="flex items-center gap-1.5 font-medium" style={{ color: dotColor }}>
          <span
            className={`h-[7px] w-[7px] rounded-full ${data && !err && data.healthy ? 'pulse' : ''}`}
            style={{ background: dotColor }}
          />
          {label}
        </span>

        <Item label="Block" value={data?.block != null ? formatNumber(data.block) : '—'} />

        <span className="text-text-secondary">
          POKT
          <b className="ml-1.5 font-medium text-text-primary">{price ? fmtPrice(price.price) : '—'}</b>
          {price && (
            <span className={`ml-1.5 ${price.change24h >= 0 ? 'text-mint' : 'text-coral'}`}>
              {price.change24h >= 0 ? '+' : ''}
              {price.change24h.toFixed(2)}%
            </span>
          )}
        </span>

        <Item label="24h Relays" value={data?.relays24h != null ? formatCompact(data.relays24h) : '—'} />
        <Item label="24h CU" value={data?.cu24h != null ? formatCompact(data.cu24h) : '—'} />
        <span className="text-text-secondary">
          Supply Change
          <b
            className={`ml-1.5 font-medium ${
              data?.netInflation == null ? 'text-text-primary' : data.netInflation <= 0 ? 'text-mint' : 'text-coral'
            }`}
          >
            {data?.netInflation != null ? `${data.netInflation > 0 ? '+' : ''}${data.netInflation.toFixed(2)}%/yr` : '—'}
          </b>
        </span>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-text-secondary">
      {label}
      <b className="ml-1.5 font-medium text-text-primary">{value}</b>
    </span>
  );
}
