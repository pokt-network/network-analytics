import { gqlFetch } from '@/lib/graphql';
import { NETWORK } from '@/lib/app-config';
import { SERVICES_COUNT } from '@/lib/queries/analytics';

/** Total registered services on the network (denominator for "active services · of N"). */
export async function getServicesCount(): Promise<number> {
  const data = await gqlFetch<{ services: { totalCount: number } }>(
    NETWORK,
    SERVICES_COUNT,
    undefined,
    { revalidate: 12 * 3600 },
  );
  return Number(data.services?.totalCount ?? 0);
}
