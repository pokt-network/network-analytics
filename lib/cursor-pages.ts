'use client';

import { useEffect, useState } from 'react';
import { useTabData } from './use-tab-data';

// Prev/Next paging over a route that pages by keyset: each page after the first reads the rows after the endCursor of
// the page before it. Shared by the supplier tables and the reward issuances, and walkPages by the CSV export.

interface CursorPage {
  hasNextPage?: boolean;
  endCursor?: string | null;
  rows?: unknown[];
}

/**
 * The page on screen of `baseUrl` (which carries its own query string), and Prev / Next. `resetKey` changing (other
 * addresses, another filter) goes back to page 1. Next takes the cursor of the page actually on screen for the url being
 * shown: while a page loads the previous one's data stays on screen, so Next is off until the page's own data arrives.
 * A page past the first with no cursor is an error, never served as page 1.
 */
export function useCursorPages<T extends CursorPage>(baseUrl: string, resetKey: string, opts: { prefetchSiblings?: boolean } = {}) {
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<string[]>([]); // cursors[i]: the endCursor page i + 2 starts after
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
    setCursors([]);
  }
  const cursor = page > 1 ? cursors[page - 2] : null;
  const missing = page > 1 && !cursor;
  const url = !baseUrl || missing ? '' : cursor ? `${baseUrl}&after=${encodeURIComponent(cursor)}` : baseUrl;
  const d = useTabData<T>(url, opts);
  const current = !!url && d.url === url && !d.loading;
  const nextCursor = current && d.data?.hasNextPage ? (d.data.endCursor ?? null) : null;
  // a revalidation can shrink the list under a page (rows unstaked, a filter's set changed): an empty page past the
  // first steps back to the last page that has rows
  const emptyPast = current && page > 1 && (d.data?.rows?.length ?? 0) === 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (emptyPast) setPage((p) => Math.max(1, p - 1));
  }, [emptyPast]);
  return {
    data: d.data,
    loading: d.loading,
    error: missing ? `No cursor for page ${page}` : d.error,
    page,
    canNext: !!nextCursor,
    next: () => {
      if (!nextCursor) return;
      setCursors((c) => [...c.slice(0, page - 1), nextCursor]);
      setPage(page + 1);
    },
    prev: () => setPage((p) => Math.max(1, p - 1)),
  };
}

/**
 * Every row of a keyset route from its first page, `chunk` rows a call, stepping by the rows and cursor each page
 * returns, at most `cap` rows and `maxCalls` calls. `complete` is false when it stopped at a cap with rows left. A failed call, or a page that says
 * more follow without a cursor, throws.
 */
export async function walkPages<R>(
  pageUrl: (after: string | null, size: number) => string,
  chunk: number,
  cap: number,
  maxCalls: number,
): Promise<{ rows: R[]; complete: boolean }> {
  const rows: R[] = [];
  let after: string | null = null;
  for (let calls = 0; calls < maxCalls && rows.length < cap; calls++) {
    // the last call asks only for what the cap still needs
    const res = await fetch(pageUrl(after, Math.min(chunk, cap - rows.length)));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CursorPage & { rows: R[] };
    rows.push(...data.rows);
    if (!data.hasNextPage) return { rows, complete: true };
    if (!data.endCursor) throw new Error('a page says more rows follow but carries no cursor');
    after = data.endCursor;
  }
  return { rows, complete: false };
}
