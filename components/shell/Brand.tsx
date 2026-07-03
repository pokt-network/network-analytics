// Explorer-matching lockup: [Pocket logo] │ Analytics. White wordmark on dark, black on light
// (toggled by the [data-theme] Tailwind selector). The logo links to the dashboard home.
import Link from 'next/link';

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-[14px] no-underline" aria-label="Pocket Analytics — home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pocket-logo-white.svg" alt="Pocket" className="hidden h-[26px] w-auto dark:block" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pocket-logo-black.svg" alt="Pocket" className="block h-[26px] w-auto dark:hidden" />
      <span className="h-6 w-px bg-line-hover" />
      <span className="text-[19px] font-medium tracking-[-0.2px] text-text-secondary">Analytics</span>
    </Link>
  );
}
