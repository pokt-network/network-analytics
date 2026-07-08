'use client';

import { useIsFetching } from '@/lib/loading-store';

// Thin indeterminate bar pinned to the very top of the viewport whenever any user-visible fetch is
// in flight. Visibility is derived straight from the store; the CSS opacity transition on `.topbar`
// provides a perceptible fade-in/out even for quick hits.
export function TopProgressBar() {
  const fetching = useIsFetching();
  return (
    <div className={`topbar ${fetching ? 'is-active' : ''}`} role="presentation" aria-hidden="true">
      <span className="topbar-glint" />
    </div>
  );
}
