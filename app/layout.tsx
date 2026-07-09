import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { ThemeScript } from '@/components/shell/ThemeScript';
import { Atmosphere } from '@/components/shell/Atmosphere';
import { TopProgressBar } from '@/components/shell/TopProgressBar';
import { AppBar } from '@/components/shell/AppBar';
import { LiveStrip } from '@/components/shell/LiveStrip';
import { Footer } from '@/components/shell/Footer';
import { DiagnosticsOverlay } from '@/components/diag/DiagnosticsOverlay';
import { NetworkProvider } from '@/lib/network-context';
import { NETWORK } from '@/lib/app-config';

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
});

const SITE_URL = 'https://analytics.pocket.network';
const DESCRIPTION =
  'Network analytics for Pocket Network — traffic, economics, and protocol health, sourced from data.pocket.network.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Pocket Analytics', template: '%s · Pocket Analytics' },
  description: DESCRIPTION,
  applicationName: 'Pocket Analytics',
  openGraph: {
    type: 'website',
    siteName: 'Pocket Analytics',
    title: 'Pocket Network Analytics',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pocket Network Analytics',
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme is set pre-paint by ThemeScript; suppress the resulting hydration diff.
  return (
    <html lang="en" suppressHydrationWarning className={rubik.variable}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <TopProgressBar />
        <Atmosphere />
        <NetworkProvider network={NETWORK}>
          <div className="shell">
            <AppBar />
            <LiveStrip />
            <main className="mx-auto w-full max-w-shell px-6 pb-16 pt-7">{children}</main>
            <Footer />
          </div>
          <DiagnosticsOverlay />
        </NetworkProvider>
      </body>
    </html>
  );
}
