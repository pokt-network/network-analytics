import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

export async function resolve(specifier, context, next) {
  const url = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), root)
    : specifier.startsWith('.') && context.parentURL
      ? new URL(specifier, context.parentURL)
      : null;
  if (url && !/\.[cm]?[jt]sx?$/.test(url.pathname)) {
    for (const ext of ['.ts', '.tsx']) {
      const candidate = new URL(url.href + ext);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
  }
  return next(url ? url.href : specifier, context);
}
