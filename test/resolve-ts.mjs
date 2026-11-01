import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = new URL('../', import.meta.url);

export async function resolve(specifier, context, next) {
  // next ships no exports map: Node's ESM resolver needs the file (the bundler resolves `next/cache` and the like itself)
  if (/^next\/[a-z-]+$/.test(specifier)) return next(`${specifier}.js`, context);
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

// The app's own .ts files are compiled here, not by Node: Node 26 strips types only (no parameter properties, which
// lib/graphql.ts uses) and no longer accepts --experimental-transform-types, so the suite runs the same on Node 24 and 26.
export async function load(url, context, next) {
  if (!url.startsWith(root.href) || url.includes('/node_modules/') || !/\.m?ts$/.test(url)) return next(url, context);
  const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
    fileName: fileURLToPath(url),
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, sourceMap: false, inlineSourceMap: true },
  });
  return { format: 'module', source: outputText, shortCircuit: true };
}
