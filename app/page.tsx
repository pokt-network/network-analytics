import { Dashboard } from '@/components/dashboard/Dashboard';

// Read `?tab=` on the server so a deep link renders the right tab immediately (no Suspense/flash).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const initialTab = typeof params.tab === 'string' ? params.tab : undefined;
  return <Dashboard initialTab={initialTab} />;
}
