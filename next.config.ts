import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // /_next/image is off. `unoptimized` turns off Next's own optimizer (self-hosted);
  // on Vercel the hosted image service still runs, and with no localPatterns it
  // fetches any of the app's own routes by URL. Empty lists allow no source at all.
  images: { unoptimized: true, remotePatterns: [], localPatterns: [] },
  /* Matches explorer defaults. Analytics is a single-page dashboard; no rewrites needed. */
};

export default nextConfig;
