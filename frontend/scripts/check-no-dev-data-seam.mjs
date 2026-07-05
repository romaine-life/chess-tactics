#!/usr/bin/env node
// GUARD: the CAMPAIGN DATA PATH must behave identically in dev and prod. Its only source of
// truth is the backend/DB (net/campaignWorkspace loadOfficialCampaigns/loadWorkspace); there is
// no dev-only fixture, no client-side seed, no "works locally, absent in prod" branch.
//
// Why this exists: a dev-only `if (import.meta.env.DEV) mergeOfficial(localFixture)` in hydrate.ts
// once made a whole campaign appear in dev while being dead-code-eliminated from prod and never
// written to the DB — silently routing around the "testing uses the prod DB" rule. This check
// makes that seam FAIL THE BUILD instead of passing quietly. Adding content is only sanctioned
// via the DB (PUT /api/official-campaigns), which is auditable.
//
// Scope: the campaign data path only (campaign store/hydrate + the campaign net client) — NOT
// unrelated dev mocks (auth/bgm live in vite.config plugins, by design).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIRS = ['src/campaign'];
const SCAN_FILES = ['src/net/campaignWorkspace.ts'];

// Mode-conditional seams: anything that makes the data layer diverge between dev and prod.
const BANNED = [
  { re: /import\.meta\.env\.(DEV|PROD|MODE|SSR)\b/, why: 'dev/prod-conditional data source (use the DB in both)' },
  { re: /process\.env\.NODE_ENV\b/, why: 'NODE_ENV-conditional data source (use the DB in both)' },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

const files = [...SCAN_DIRS.flatMap((d) => walk(join(root, d))), ...SCAN_FILES.map((f) => join(root, f))];
const violations = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return; // skip comments
    for (const { re, why } of BANNED) if (re.test(line)) violations.push({ file: relative(root, file), line: i + 1, why, text: line.trim() });
  });
}

if (violations.length) {
  console.error('\n✗ check-no-dev-data-seam: the campaign data path must be identical in dev and prod.\n');
  for (const v of violations) console.error(`  ${v.file}:${v.line}  — ${v.why}\n      ${v.text}`);
  console.error('\n  Campaigns/levels enter the store ONLY from the backend/DB. To add content, write it to the DB\n  (PUT /api/official-campaigns) — never a dev-only client-side fixture.\n');
  process.exit(1);
}
console.log(`✓ check-no-dev-data-seam: campaign data path clean (${files.length} files, no dev/prod seam)`);
