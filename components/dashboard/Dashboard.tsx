'use client';

import { useEffect, useState } from 'react';
import { IconActivity, IconCoin, IconAffiliate, IconServer2, IconStack2, IconLoader2 } from '@tabler/icons-react';
import { useIsFetching } from '@/lib/loading-store';
import { RangePills } from './RangePills';
import { Tabbar, type TabDef } from './Tabbar';
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from '@/lib/app-config';
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

export function Dashboard({ initialTab, initialRange, initialService }: { initialTab?: string; initialRange?: string; initialService?: string }) {
  // tab / range / service live in the URL so the dashboard is deep-linkable. The initial values come
  // from the server (page reads the query), so a deep link renders correctly with no flash.
  const [tab, setTabState] = useState<TabKey>(isTabKey(initialTab) ? initialTab : 'traffic');
  const [range, setRangeState] = useState<RangeKey>(isRangeKey(initialRange) ? initialRange : DEFAULT_RANGE);
  // Service is shared so links elsewhere (e.g. the Traffic performance table) can open a service. A
  // deep link only carries the id; the name is resolved for display from the services list.
  const [svc, setSvcState] = useState<ServiceItem | null>(initialService ? { id: initialService, name: initialService } : null);
  const fetching = useIsFetching();

  // Write the given (partial) state to the URL. `range` defaults are omitted to keep links clean;
  // range uses replaceState (a filter, not navigation) while tab/service push a history entry.
  const writeUrl = (next: { tab?: TabKey; range?: RangeKey; svc?: ServiceItem | null }, replace = false) => {
    const t = next.tab ?? tab;
    const r = next.range ?? range;
    const s = next.svc !== undefined ? next.svc : svc;
    const params = new URLSearchParams(window.location.search);
    params.set('tab', t);
    if (r === DEFAULT_RANGE) params.delete('range');
    else params.set('range', r);
    // `service` is only meaningful on the Services tab. Carrying it onto any other tab produces
    // messy, misleading share links (e.g. an Economy URL with `&service=opbnb`), so scope it to the
    // Services tab and drop it everywhere else. Other args (range, diag, …) are preserved untouched.
    if (s && t === 'services') params.set('service', s.id);
    else params.delete('service');
    const url = `${window.location.pathname}?${params.toString()}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  };

  // Keep state in sync with browser back/forward (which change the URL without remounting).
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search);
      setTabState(isTabKey(p.get('tab')) ? (p.get('tab') as TabKey) : 'traffic');
      setRangeState(isRangeKey(p.get('range')) ? (p.get('range') as RangeKey) : DEFAULT_RANGE);
      const s = p.get('service');
      setSvcState(s ? { id: s, name: s } : null);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const setTab = (k: TabKey) => {
    if (k === tab) return;
    setTabState(k);
    // Leaving Services clears the selected service so it doesn't linger in state or reappear in the
    // URL on return; writeUrl already omits `service` for non-Services tabs.
    if (k !== 'services') setSvcState(null);
    writeUrl({ tab: k });
  };
  const setRange = (r: RangeKey) => {
    if (r === range) return;
    setRangeState(r);
    writeUrl({ range: r }, true);
  };
  const setSvc = (s: ServiceItem | null) => {
    setSvcState(s);
    writeUrl({ svc: s });
  };
  const openService = (item: ServiceItem) => {
    setSvcState(item);
    setTabState('services');
    writeUrl({ tab: 'services', svc: item });
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
        {tab === 'economy' && <EconomyTab range={range} />}
        {tab === 'services' && <ServicesTab range={range} svc={svc} onSelectService={setSvc} />}
      </div>
    </>
  );
}
