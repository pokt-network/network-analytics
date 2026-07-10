import { IconActivity, IconCoin, IconAffiliate, IconServer2, IconStack2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';

// The five primary dashboard views. Shared by the desktop Tabbar and the mobile hamburger menu so
// both render the same set/order from one source.
export type TabKey = 'traffic' | 'economy' | 'network' | 'suppliers' | 'services';

export interface TabDef {
  key: TabKey;
  label: string;
  icon: ReactNode;
  badge?: string;
}

export const TABS: TabDef[] = [
  { key: 'traffic', label: 'Traffic', icon: <IconActivity size={17} /> },
  { key: 'economy', label: 'Economy', icon: <IconCoin size={17} /> },
  { key: 'network', label: 'Network', icon: <IconAffiliate size={17} /> },
  { key: 'suppliers', label: 'Suppliers', icon: <IconServer2 size={17} /> },
  { key: 'services', label: 'Services', icon: <IconStack2 size={17} /> },
];

const TAB_KEYS = TABS.map((t) => t.key);

export function isTabKey(v: string | null | undefined): v is TabKey {
  return v != null && (TAB_KEYS as string[]).includes(v);
}
