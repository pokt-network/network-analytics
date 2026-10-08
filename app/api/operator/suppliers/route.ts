import { NextResponse, type NextRequest } from 'next/server';
import { getOperatorSuppliers, type SupplierListPage } from '@/lib/data/operator';
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
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const reqSize = Number(req.nextUrl.searchParams.get('pageSize'));
  const pageSize = Number.isFinite(reqSize) && reqSize > 0 ? Math.min(reqSize, MAX_PAGE_SIZE) : PAGE_SIZE;

  if (addresses.length === 0) return NextResponse.json({ rows: [], totalCount: 0 } satisfies SupplierListPage);
  return NextResponse.json(await getOperatorSuppliers(addresses, page, pageSize));
}
