import { Dashboard } from '@/components/dashboard/Dashboard';

// Read `?tab=` / `?range=` / `?service=` on the server so a deep link renders the right state
// immediately (no Suspense/flash).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  return <Dashboard initialTab={str(params.tab)} initialRange={str(params.range)} initialService={str(params.service)} />;
}
