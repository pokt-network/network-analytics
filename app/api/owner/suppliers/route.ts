import { NextResponse, type NextRequest } from 'next/server';
import { getOwnerSuppliers } from '@/lib/data/owner';
import { type SupplierListPage, isStakeFilter, type StakeFilter } from '@/lib/data/suppliers-list';
import { ADDRESS_RE } from '@/lib/staking/addresses';
import { OWNER_ADDRESS_CAP } from '@/lib/app-config';

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function parseAddrs(param: string | null): string[] {
  if (!param) return [];
  return param.split(',').map((s) => s.trim()).filter((a) => ADDRESS_RE.test(a)).slice(0, OWNER_ADDRESS_CAP);
}

export async function GET(req: NextRequest) {
  const addresses = parseAddrs(req.nextUrl.searchParams.get('addresses'));
  const filterParam = req.nextUrl.searchParams.get('filter');
  const filter: StakeFilter = isStakeFilter(filterParam) ? filterParam : 'all';
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;

  if (addresses.length === 0) return NextResponse.json({ rows: [], totalCount: 0 } satisfies SupplierListPage);
  return NextResponse.json(await getOwnerSuppliers(addresses, filter, page, pageSize));
}
