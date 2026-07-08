'use client';

import { useEffect, useState } from 'react';
import { IconActivity, IconCoin, IconAffiliate, IconServer2, IconStack2, IconLoader2 } from '@tabler/icons-react';
import { useIsFetching } from '@/lib/loading-store';
import { RangePills } from './RangePills';
import { Tabbar, type TabDef } from './Tabbar';
import { DEFAULT_RANGE, type RangeKey } from '@/lib/app-config';
import { TrafficTab } from '@/components/tabs/TrafficTab';
import { NetworkTab } from '@/components/tabs/NetworkTab';
import { SuppliersTab } from '@/components/tabs/SuppliersTab';
import { EconomyTab } from '@/components/tabs/EconomyTab';
import { ServicesTab } from '@/components/tabs/ServicesTab';
import type { ServiceItem } from '@/components/tabs/ServicePicker';

type TabKey = 'traffic' | 'economy' | 'network' | 'suppliers' | 'services';

const TABS: (TabDef & { key: TabKey })[] = [
  { key: 'traffic', label: 'Traffic', icon: <IconActivity size={17} /> },
  { key: 'economy', label: 'Economy', icon: <IconCoin size={17} /> },
  { key: 'network', label: 'Network', icon: <IconAffiliate size={17} /> },
  { key: 'suppliers', label: 'Suppliers', icon: <IconServer2 size={17} /> },
  { key: 'services', label: 'Services', icon: <IconStack2 size={17} /> },
];

const TAB_KEYS = TABS.map((t) => t.key);
function isTabKey(v: string | null | undefined): v is TabKey {
  return v != null && (TAB_KEYS as string[]).includes(v);
}

export function Dashboard({ initialTab }: { initialTab?: string }) {
  // The active tab is reflected in the URL (`?tab=`) so tabs are deep-linkable. `initialTab` comes
  // from the server (page reads the query), so a deep link renders the right tab with no flash.
  const [tab, setTabState] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'traffic');

  // Keep in sync with browser back/forward (which change the URL without remounting).
  useEffect(() => {
    const sync = () => {
      const t = new URLSearchParams(window.location.search).get('tab');
      setTabState(isTabKey(t) ? t : 'traffic');
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const setTab = (k: TabKey) => {
    if (k === tab) return;
    setTabState(k);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', k);
    // pushState (not replace) so back/forward navigate tab history; query-only, no server round-trip.
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  // Selected service is shared so links elsewhere (e.g. the Traffic performance table) can open the
  // Services tab focused on a specific service.
  const [svc, setSvc] = useState<ServiceItem | null>(null);
  const fetching = useIsFetching();

  const openService = (item: ServiceItem) => {
    setSvc(item);
    setTab('services');
  };

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.4px]">Network Analytics</h1>
          <p className="mt-[3px] text-[15px] text-text-secondary">
            Traffic, economics, and protocol health — sourced from data.pocket.network
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary transition-opacity duration-200 ${
              fetching ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!fetching}
          >
            <IconLoader2 size={14} className="animate-spin" />
            Updating…
          </span>
          <RangePills value={range} onChange={setRange} />
        </div>
      </div>

      <Tabbar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div
        className={`mt-6 transition-opacity duration-200 ${fetching ? 'opacity-60' : 'opacity-100'}`}
        aria-busy={fetching}
      >
        {tab === 'traffic' && <TrafficTab range={range} onOpenService={openService} />}
        {tab === 'network' && <NetworkTab range={range} />}
        {tab === 'suppliers' && <SuppliersTab range={range} />}
        {tab === 'economy' && <EconomyTab />}
        {tab === 'services' && <ServicesTab range={range} svc={svc} onSelectService={setSvc} />}
      </div>
    </>
  );
}
