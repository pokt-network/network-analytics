'use client';

import { useEffect, useState } from 'react';
import { useTabData } from './use-tab-data';

// Prev/Next paging over a route that pages by keyset: each page after the first reads the rows after the endCursor of
// the page before it. Shared by the supplier tables and the reward issuances, and walkPages by the CSV export.

interface CursorPage {
  hasNextPage?: boolean;
  endCursor?: string | null;
  rows?: unknown[];
  totalCount?: number;
}

/**
 * The page on screen of `baseUrl` (which carries its own query string), and Prev / Next. `resetKey` changing (other
 * addresses, another filter) goes back to page 1. Next takes the cursor of the page actually on screen for the url being
 * shown: while a page loads the previous one's data stays on screen, so Next is off until the page's own data arrives.
 * A page past the first with no cursor is an error, never served as page 1.
 *
 * `rowKey` (for a keyset on a value that can change, such as a supplier's stake) makes it check the walk: `repeats` are
 * rows of this page already shown on an earlier one, and `missed`, on the last page, how many of the list's totalCount
 * the pages from the first one never showed. A row whose key value crosses the page boundary between two reads is
 * shown twice or skipped; the other rows do not shift.
 */
export function useCursorPages<T extends CursorPage>(
  baseUrl: string,
  resetKey: string,
  opts: { prefetchSiblings?: boolean; rowKey?: (row: unknown) => string } = {},
) {
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<string[]>([]); // cursors[i]: the endCursor page i + 2 starts after
  const [shown, setShown] = useState<string[][]>([]); // shown[i]: the row keys page i + 1 showed
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
    setCursors([]);
    setShown([]);
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
  const { rowKey } = opts;
  const keys = current && rowKey ? (d.data?.rows ?? []).map(rowKey) : null;
  const keysJoined = keys?.join('\n') ?? null;
  useEffect(() => {
    if (keysJoined === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown((s) => {
      const next = s.slice(0, page);
      next[page - 1] = keysJoined ? keysJoined.split('\n') : [];
      return next;
    });
  }, [keysJoined, page]);
  const { repeats, missed } = keys ? walkCheck(shown, page, keys, !!d.data?.hasNextPage, d.data?.totalCount) : { repeats: 0, missed: 0 };
  return {
    repeats,
    missed,
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
 * The walk check of useCursorPages: `shown[i]` the row keys page i + 1 showed (this page's own may not be recorded yet),
 * `keys` this page's. repeats = this page's keys already on an earlier page; missed = on the last page, with every
 * earlier page recorded, how many of `total` no page showed.
 */
export function walkCheck(shown: string[][], page: number, keys: string[], hasNextPage: boolean, total?: number): { repeats: number; missed: number } {
  const earlier = new Set(shown.slice(0, page - 1).flat());
  const repeats = keys.filter((k) => earlier.has(k)).length;
  // every earlier page recorded: an index loop, as every() skips the holes of a sparse array
  let walked = true;
  for (let i = 0; i < page - 1; i++) if (!shown[i]) walked = false;
  const distinct = new Set([...earlier, ...keys]).size;
  const missed = !hasNextPage && walked && typeof total === 'number' ? Math.max(0, total - distinct) : 0;
  return { repeats, missed };
}

/**
 * Every row of a keyset route from its first page, `chunk` rows a call, stepping by the rows and cursor each page
 * returns, at most `cap` rows and `maxCalls` calls. `complete` is false when it stopped at a cap with rows left. A
 * failed call, or a page that says more follow without a cursor, throws.
 *
 * `probeAtCap`: a route paged with no lookahead row says "more may follow" on every full page, so a walk that reaches
 * the cap on a full page cannot tell whether it read everything; with this it reads 1 row past the last cursor to
 * know (one extra call, only at that edge).
 */
export async function walkPages<R>(
  pageUrl: (after: string | null, size: number) => string,
  chunk: number,
  cap: number,
  maxCalls: number,
  probeAtCap = false,
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
  if (probeAtCap && rows.length >= cap && after) {
    // a failed probe keeps the rows read: the walk is then just not known to be complete
    try {
      const res = await fetch(pageUrl(after, 1));
      if (res.ok) return { rows, complete: ((await res.json()) as { rows: R[] }).rows.length === 0 };
    } catch {
      /* the rows stand; completeness unknown */
    }
    return { rows, complete: false };
  }
  return { rows, complete: false };
}

/** The page url builder of an export walk over a windowed route: every page and the probe carry the same `at`, the
 *  minute the walk pinned its window to when it started, so a walk that crosses a minute does not move its window. */
export function pinnedPageUrl(base: string, at: number): (after: string | null, size: number) => string {
  return (after, size) => `${base}&lookahead=0&at=${at}&pageSize=${size}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
}
