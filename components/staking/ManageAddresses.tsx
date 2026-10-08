'use client';

import { useState } from 'react';
import { IconListCheck, IconCopy, IconCheck, IconX } from '@tabler/icons-react';
import { Card, CardHeader } from '@/components/ui/Card';
import { useStakingTool } from './StakingToolContext';
import { parseAddressInput } from '@/lib/staking/addresses';
import { truncate } from '@/lib/format';

// Shared address input for both staking tools. The primary action is inset in the textarea's
// bottom-right (poktscan-style); the entered addresses appear below as a removable "Selected
// Addresses" set — each pill carries its series-color dot and an ✕ to drop it, so the list reads as
// the live filter set rather than a static label strip. Adding merges into the existing set.
export function ManageAddresses({
  actionLabel = 'View Rewards',
  placeholder,
}: {
  actionLabel?: string;
  placeholder?: string;
}) {
  const { addresses, setAddresses, cap, colorFor } = useStakingTool();
  const [input, setInput] = useState('');
  const [dropped, setDropped] = useState(0);
  const [copied, setCopied] = useState(false);

  const atCap = addresses.length >= cap;

  function add() {
    const { valid, invalid } = parseAddressInput(input, cap);
    const merged = [...addresses];
    for (const a of valid) if (!merged.includes(a)) merged.push(a);
    setAddresses(merged.slice(0, cap));
    setDropped(invalid.length);
    setInput('');
  }

  function remove(addr: string) {
    setAddresses(addresses.filter((a) => a !== addr));
  }

  function clearAll() {
    setAddresses([]);
    setInput('');
    setDropped(0);
  }

  function copyAll() {
    navigator.clipboard
      ?.writeText(addresses.join('\n'))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Track Addresses"
        icon={<IconListCheck size={18} />}
        right={<span className="text-[12px] text-text-tertiary">saved to this browser</span>}
      />
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter adds without reaching for the mouse.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add();
          }}
          placeholder={placeholder ?? 'Paste one or more addresses (comma, space, or line separated)\npokt1…'}
          className="min-h-[110px] w-full resize-y rounded-[10px] border bg-bg-card p-3.5 pr-[128px] font-mono text-[13px] text-text-primary outline-none focus:border-blue"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim() || atCap}
          title={atCap ? `Address limit of ${cap} reached` : undefined}
          className="absolute bottom-3 right-3 rounded-[9px] bg-blue px-[16px] py-2 text-[13px] font-medium text-white hover:bg-[#0148c4] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionLabel}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <span className="text-[12px] text-text-tertiary">
          {addresses.length} / {cap} addresses
        </span>
        {atCap && <span className="text-[12px] text-gold">address limit reached</span>}
        {dropped > 0 && (
          <span className="text-[12px] text-coral">
            {dropped} invalid entr{dropped === 1 ? 'y' : 'ies'} dropped
          </span>
        )}
        {addresses.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-bg-card px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
            >
              {copied ? <IconCheck size={14} className="text-mint" /> : <IconCopy size={14} />}
              {copied ? 'Copied' : 'Copy all'}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border bg-bg-card px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {addresses.length > 0 && (
        <div className="mt-3.5 border-t pt-3.5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary">
            Selected Addresses
          </div>
          <div className="flex flex-wrap gap-2">
            {addresses.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full border bg-bg-surface py-1 pl-2.5 pr-1.5 font-mono text-[12px] text-text-secondary"
              >
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorFor(a) }} />
                {truncate(a, 8, 5)}
                <button
                  type="button"
                  onClick={() => remove(a)}
                  aria-label={`Remove ${a}`}
                  title="Remove"
                  className="grid h-[18px] w-[18px] place-items-center rounded-full text-text-tertiary transition-colors hover:bg-bg-card-hover hover:text-coral"
                >
                  <IconX size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
