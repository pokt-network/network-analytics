'use client';

import { useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Fetch JSON from an internal route handler, refetching when `url` changes. Keeps prior data
 *  visible during a refetch (so range switches don't flash empty). */
export function useTabData<T>(url: string): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!url) {
      // Intentional: this is a data-fetching hook; going idle on an empty url is the sync we want.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ data: null, loading: false, error: null });
      return;
    }
    let active = true;
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true, error: null }));
    fetch(url, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<T>;
      })
      .then((json) => {
        if (active) setState({ data: json, loading: false, error: null });
      })
      .catch((e: Error) => {
        if (active && e.name !== 'AbortError') setState((s) => ({ data: s.data, loading: false, error: e.message }));
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [url]);

  return state;
}
