// The services tables' and the Traffic chart's sizes and orders, shared by the server reads and the client (no server
// imports here).

/** Services in the chart when the user has not picked any. */
export const SERIES_DEFAULT = 5;
/** Most services the chart reads and draws at once. */
export const SERIES_MAX = 20;
/** Rows per Service Performance page. */
export const PERF_PAGE_SIZE = 10;
/** Services with their own distribution slice; the rest of the network total is "others". */
export const DONUT_TOP = 6;
/** Rows a page read may ask for (the CSV export and the selector read pages this long). */
export const PERF_PAGE_MAX = 200;

/** The orders get_service_usage pages a services table by (one per sortable column). */
export const USAGE_ORDERS = ['estimated_compute_units', 'estimated_relays', 'service_id', 'name', 'change', 'staked_suppliers'] as const;
export type UsageOrder = (typeof USAGE_ORDERS)[number];
export const isUsageOrder = (v: unknown): v is UsageOrder => (USAGE_ORDERS as readonly unknown[]).includes(v);
