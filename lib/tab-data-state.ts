// The state useTabData keeps, and what a failed fetch does to it (pure, so it is tested without React).

export interface TabDataState<T> {
  data: T | null;
  /** The url `data` was fetched from. */
  dataUrl: string | null;
  loading: boolean;
  error: string | null;
}

/** A failed fetch of `url`: the data of the same url stays next to the error (a retry that failed), the data of
 *  another url is dropped (it must not show under this one). */
export function failedFetch<T>(s: TabDataState<T>, url: string, error: string): TabDataState<T> {
  return s.dataUrl === url ? { ...s, loading: false, error } : { data: null, dataUrl: null, loading: false, error };
}
