import { IconBrandX, IconBrandDiscord, IconBrandGithub } from '@tabler/icons-react';

export function Footer() {
  return (
    <footer className="mt-10 border-t">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-6 py-[22px] text-[13px] text-text-tertiary">
        <span>© 2026 Pocket Network Foundation · Data from data.pocket.network</span>
        <div className="flex gap-2.5">
          <a href="https://x.com/POKTnetwork" target="_blank" rel="noopener noreferrer" aria-label="X" className="grid h-[30px] w-[30px] place-items-center rounded-lg border text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary">
            <IconBrandX size={17} />
          </a>
          <a href="https://discord.gg/pocket-network" target="_blank" rel="noopener noreferrer" aria-label="Discord" className="grid h-[30px] w-[30px] place-items-center rounded-lg border text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary">
            <IconBrandDiscord size={17} />
          </a>
          <a href="https://github.com/pokt-network" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="grid h-[30px] w-[30px] place-items-center rounded-lg border text-text-secondary transition-colors hover:border-line-hover hover:text-text-primary">
            <IconBrandGithub size={17} />
          </a>
        </div>
      </div>
    </footer>
  );
}
