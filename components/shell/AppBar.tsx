import Link from 'next/link';
import { IconExternalLink } from '@tabler/icons-react';
import { Brand } from '@/components/shell/Brand';
import { ToolsMenu } from '@/components/shell/ToolsMenu';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { EXPLORER_BASE_URL } from '@/lib/app-config';

// Top app bar — matches the explorer lockup: [logo] │ Analytics, then nav (Analytics active,
// Explorer ↗ to the sibling app, Tools dropdown) and the theme toggle.
export function AppBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-[color-mix(in_srgb,var(--bg-primary)_88%,transparent)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-16 max-w-shell items-center gap-[18px] px-6">
        <Brand />
        <nav className="ml-auto flex items-center gap-0.5">
          <Link
            href="/"
            aria-current="page"
            className="rounded-lg px-[13px] py-2 text-sm font-medium text-blue-soft no-underline"
          >
            Analytics
          </Link>
          <a
            href={EXPLORER_BASE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg px-[13px] py-2 text-sm font-medium text-text-secondary no-underline transition-colors hover:bg-bg-card hover:text-text-primary"
          >
            Explorer
            <IconExternalLink size={14} />
          </a>
          <ToolsMenu />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
