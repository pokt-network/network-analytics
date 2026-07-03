'use client';

import { useState } from 'react';
import { IconActivity, IconCoin, IconAffiliate, IconServer2, IconStack2 } from '@tabler/icons-react';
import { RangePills } from './RangePills';
import { Tabbar, type TabDef } from './Tabbar';
import { DEFAULT_RANGE, type RangeKey } from '@/lib/app-config';
import { TrafficTab } from '@/components/tabs/TrafficTab';
import { NetworkTab } from '@/components/tabs/NetworkTab';
import { SuppliersTab } from '@/components/tabs/SuppliersTab';
import { EconomyTab } from '@/components/tabs/EconomyTab';
import { ServicesTab } from '@/components/tabs/ServicesTab';

type TabKey = 'traffic' | 'economy' | 'network' | 'suppliers' | 'services';

const TABS: (TabDef & { key: TabKey })[] = [
  { key: 'traffic', label: 'Traffic', icon: <IconActivity size={17} /> },
  { key: 'economy', label: 'Economy', icon: <IconCoin size={17} /> },
  { key: 'network', label: 'Network', icon: <IconAffiliate size={17} /> },
  { key: 'suppliers', label: 'Suppliers', icon: <IconServer2 size={17} /> },
  { key: 'services', label: 'Services', icon: <IconStack2 size={17} /> },
];

export function Dashboard() {
  const [tab, setTab] = useState<TabKey>('traffic');
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);

  return (
    <>
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.4px]">Network Analytics</h1>
          <p className="mt-[3px] text-[15px] text-text-secondary">
            Traffic, economics, and protocol health — sourced from data.pocket.network
          </p>
        </div>
        <RangePills value={range} onChange={setRange} />
      </div>

      <Tabbar tabs={TABS} active={tab} onChange={(k) => setTab(k as TabKey)} />

      <div className="mt-6">
        {tab === 'traffic' && <TrafficTab range={range} />}
        {tab === 'network' && <NetworkTab range={range} />}
        {tab === 'suppliers' && <SuppliersTab range={range} />}
        {tab === 'economy' && <EconomyTab />}
        {tab === 'services' && <ServicesTab range={range} />}
      </div>
    </>
  );
}
