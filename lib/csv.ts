// Client-side CSV export for chart cards. Builds a clean, tool-friendly table (a single header
// row + data rows, no preamble) from the exact rows/series a chart is currently rendering — so a
// download mirrors the on-screen filtered state (active range, selected services, toggled totals).

import type { SeriesDef } from '@/components/charts/TimeChart';

type Row = Record<string, number | string | null>;

/** RFC-4180 cell escaping: wrap in quotes when the value contains a comma, quote, or newline. */
function escapeCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Join a header + rows into a CSV string (CRLF endings, the RFC-4180 / Excel default). */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/**
 * Build a CSV from a time-series chart's displayed rows. The first column is the raw ISO bucket
 * start (precise + sortable, so hourly buckets keep their time); each selected series contributes
 * one value column headed by its on-screen label. Missing points export as empty cells.
 */
export function chartCsv(rows: Row[], series: SeriesDef[], xKey = 'date'): string {
  const headers = ['period_utc', ...series.map((s) => s.label)];
  const body = rows.map((r) => [
    String(r[xKey] ?? ''),
    ...series.map((s) => {
      const v = r[s.key];
      return v == null ? '' : v;
    }),
  ]);
  return toCsv(headers, body);
}

/** Trigger a browser download of `csv` as `filename`. Prepends a UTF-8 BOM so Excel reads it correctly. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Slugify a filename part: lowercase, non-alphanumeric runs → single dash, trimmed. */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
