import { toDate } from '@/lib/time';
import { formatCompact } from '@/lib/format';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis/tooltip number: compact (412.8M, 1.7T). */
export function fmtNum(n: number): string {
  return formatCompact(n);
}

/** X-axis tick from an ISO bucket start, formatted by bucket size. */
export function fmtDateTick(iso: string, interval: 'hour' | 'day' | 'week'): string {
  const d = toDate(iso);
  if (!d) return '';
  const mon = MON[d.getUTCMonth()];
  const day = d.getUTCDate();
  if (interval === 'hour') return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  return `${mon} ${day}`;
}

/** Full tooltip label (always includes the date). */
export function fmtDateFull(iso: string): string {
  const d = toDate(iso);
  if (!d) return '';
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`;
}
