#!/usr/bin/env node
// Vendor-sync: copies the shared data-layer + live-status files from the sibling explorer repo
// into this repo, byte-for-byte (under a banner), so the JSON-scalar payload types and fetch
// discipline never drift between the two apps.
//
//   npm run sync-vendor          # copy upstream → here (writes files)
//   npm run sync-vendor:check    # report drift only, exit 1 if any (CI-friendly)
//
// Source repo is resolved from EXPLORER_PATH (default ../../Explorer/pnf-explorer), relative to
// this repo root. Each vendored file below keeps its explorer-relative path so imports stay
// identical and diffs stay meaningful. Do NOT hand-edit vendored files — edit upstream + re-sync.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPLORER = resolve(REPO_ROOT, process.env.EXPLORER_PATH ?? '../../Explorer/pnf-explorer');

// Files vendored verbatim (same relative path in both repos).
const MANIFEST = [
  'lib/graphql.ts',
  'lib/lcd.ts',
  'lib/config.ts',
  'lib/errors.ts',
  'lib/types.ts',
  'lib/metadata.ts',
  'lib/format.ts',
  'lib/time.ts',
  'lib/networks.ts',
  'lib/network-context.tsx',
  'lib/tx.ts',
  'lib/validator.ts',
  'lib/service.ts',
  'lib/brand.ts',
  'lib/queries/shared.ts',
  'hooks/useStatus.ts',
];

const BANNER =
  '// ─────────────────────────────────────────────────────────────────────────────\n' +
  '// VENDORED from pnf-explorer — DO NOT EDIT HERE.\n' +
  '// Managed by scripts/sync-vendor.mjs. Edit upstream in the explorer repo, then re-sync.\n' +
  '// ─────────────────────────────────────────────────────────────────────────────\n\n';

/** Strip a previously-applied banner so we compare only the real content. */
function stripBanner(text) {
  return text.startsWith('// ────') ? text.slice(text.indexOf('\n\n') + 2) : text;
}

const checkOnly = process.argv.includes('--check');

if (!existsSync(EXPLORER)) {
  console.error(`✗ Explorer repo not found at: ${EXPLORER}`);
  console.error('  Set EXPLORER_PATH to the sibling explorer checkout.');
  process.exit(1);
}

let changed = 0;
let missing = 0;

for (const rel of MANIFEST) {
  const srcPath = join(EXPLORER, rel);
  const destPath = join(REPO_ROOT, rel);

  if (!existsSync(srcPath)) {
    console.error(`✗ MISSING upstream: ${rel}`);
    missing++;
    continue;
  }

  const src = readFileSync(srcPath, 'utf8');
  const destExists = existsSync(destPath);
  const destContent = destExists ? stripBanner(readFileSync(destPath, 'utf8')) : null;
  const drift = destContent !== src;

  if (!drift) {
    console.log(`  ok    ${rel}`);
    continue;
  }

  changed++;
  if (checkOnly) {
    console.log(`  DRIFT ${rel} ${destExists ? '(content differs)' : '(new)'}`);
  } else {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, BANNER + src, 'utf8');
    console.log(`  sync  ${rel} ${destExists ? '(updated)' : '(new)'}`);
  }
}

console.log('');
if (missing) {
  console.error(`✗ ${missing} file(s) missing upstream — manifest may be stale.`);
  process.exit(1);
}
if (checkOnly && changed) {
  console.error(`✗ ${changed} vendored file(s) drift from upstream. Run: npm run sync-vendor`);
  process.exit(1);
}
console.log(checkOnly ? '✓ Vendored files in sync.' : `✓ Synced (${changed} written).`);
