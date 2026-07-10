'use client';

import { IconDownload } from '@tabler/icons-react';
import type { SeriesDef } from './TimeChart';
import { chartCsv, downloadCsv, csvFilename } from '@/lib/csv';

type Row = Record<string, number | string | null>;

/**
 * Downloads the currently displayed chart data as CSV. Pass the SAME `data` and `series` the chart
 * is rendering — already narrowed to the active range and the user's series/service selection — so
 * the file mirrors exactly what's on screen. `name` is the descriptive filename base; `range` (and
 * today's date) are appended for provenance.
 */
export function ChartCsvButton({
  data,
  series,
  xKey = 'date',
  name,
  range,
}: {
  data: Row[];
  series: SeriesDef[];
  xKey?: string;
  name: string;
  range?: string;
}) {
  const disabled = data.length === 0 || series.length === 0;

  const onClick = () => {
    if (disabled) return;
    downloadCsv(csvFilename(name, range), chartCsv(data, series, xKey));
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'No data to download' : 'Download CSV (current view)'}
      aria-label="Download CSV"
      className="grid h-8 w-8 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <IconDownload size={15} />
    </button>
  );
}
