'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { IconChevronUp, IconChevronDown, IconSelector, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => number | string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  initialSortKey?: string;
  initialSortDir?: 'asc' | 'desc';
  rowKey: (row: T) => string;
  unit?: string; // e.g. "services", "domains" — for the "N services" caption
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  rows,
  columns,
  searchText,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  initialSortKey,
  initialSortDir = 'desc',
  rowKey,
  unit = 'rows',
  onRowClick,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, columns, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, pages);
  const start = (clampedPage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function toggleSort(col: Column<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('desc');
    }
    setPage(1);
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        {searchText ? (
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="h-9 min-w-[200px] rounded-lg border bg-bg-surface px-3 text-[13px] text-text-primary outline-none focus:border-blue"
          />
        ) : (
          <span />
        )}
        <span className="text-[12px] text-text-tertiary">
          {sorted.length} {unit} · page {clampedPage} of {pages}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c)}
                    className={`border-b px-3 pb-[11px] text-[11px] font-medium uppercase tracking-[0.5px] text-text-secondary ${
                      c.align === 'right' ? 'text-right' : 'text-left'
                    } ${c.sortValue ? 'cursor-pointer select-none hover:text-text-primary' : ''} whitespace-nowrap`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {c.sortValue &&
                        (active ? (
                          sortDir === 'asc' ? (
                            <IconChevronUp size={13} className="text-blue-soft" />
                          ) : (
                            <IconChevronDown size={13} className="text-blue-soft" />
                          )
                        ) : (
                          <IconSelector size={13} className="opacity-50" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`hover:bg-bg-card-hover ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border-b px-3 py-3 ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-text-tertiary">
                  No matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3.5 flex items-center justify-between gap-3 text-[13px] text-text-secondary">
          <span>
            Showing {sorted.length === 0 ? 0 : start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1.5">
            <PagerBtn disabled={clampedPage <= 1} onClick={() => setPage(clampedPage - 1)}>
              <IconChevronLeft size={16} />
            </PagerBtn>
            <PagerBtn disabled={clampedPage >= pages} onClick={() => setPage(clampedPage + 1)}>
              <IconChevronRight size={16} />
            </PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerBtn({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border bg-bg-card text-text-secondary transition-colors hover:enabled:border-line-hover hover:enabled:text-text-primary disabled:opacity-40"
    >
      {children}
    </button>
  );
}
