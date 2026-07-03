// ─────────────────────────────────────────────────────────────────────────────
// VENDORED from pnf-explorer — DO NOT EDIT HERE.
// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.
// ─────────────────────────────────────────────────────────────────────────────

import { formatPokt } from './format';

// Tx field helpers. Per DATA-CONTRACT probe: indexer `amountOfMessages` is
// [{type:"/pocket.proof.MsgSubmitProof", amount:1}], `fees`/`amountSentByDenom` are
// [{denom,amount}] (upokt). So list rows get message Type + fee without hitting the LCD.

export interface DenomAmount {
  denom: string;
  amount: string;
}
export interface MsgTypeCount {
  type: string;
  amount: number;
}

/** "/pocket.proof.MsgSubmitProof" → "MsgSubmitProof"; "/cosmos.bank.v1beta1.MsgSend" → "MsgSend". */
export function shortMsgType(typeUrl: string | undefined | null): string {
  if (!typeUrl) return '';
  const seg = typeUrl.split('.').pop();
  return seg || typeUrl;
}

export function messageTypes(amountOfMessages: unknown): MsgTypeCount[] {
  return Array.isArray(amountOfMessages) ? (amountOfMessages as MsgTypeCount[]) : [];
}

/** Primary message type for a tx row: label + full @type + total message count. */
export function primaryMessage(amountOfMessages: unknown): { label: string; full: string; count: number } | null {
  const msgs = messageTypes(amountOfMessages);
  if (!msgs.length) return null;
  const count = msgs.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  return { label: shortMsgType(msgs[0].type), full: msgs[0].type, count };
}

/** Sum upokt across a denom/amount array (fees, amountSentByDenom). */
export function sumUpokt(entries: unknown): bigint {
  if (!Array.isArray(entries)) return BigInt(0);
  let sum = BigInt(0);
  for (const e of entries as DenomAmount[]) {
    if (e?.denom === 'upokt' && e.amount != null) sum += BigInt(String(e.amount).split('.')[0] || '0');
  }
  return sum;
}

/** Tx fee in POKT for table cells, e.g. "0.0123". */
export function formatFees(fees: unknown, decimals = 4): string {
  return formatPokt(sumUpokt(fees), decimals);
}
