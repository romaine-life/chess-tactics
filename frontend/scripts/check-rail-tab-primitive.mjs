#!/usr/bin/env node
// GUARD: a menu-language rail button is `ApparatusRailTab`, and a rail column is
// `ApparatusRailColumn`. No other module may name their classes in markup.
//
// Why this exists: the primitive was AVAILABLE and four surfaces hand-assembled their own
// anyway — Settings' section tabs, the Campaign Editor's campaign tabs, its editor collection
// tabs, and Run preparation's Current Run / Start New Run. Availability is not enforcement, and
// lookalikes drift silently
// because each one still LOOKS right in isolation:
//
//   * Run's list stepped by the shared 10px row gap while the rail beside it stepped by
//     --main-menu-tab-column-gap, and grew a min-height seat the clamp()ed copy pushed past.
//     Same width, same first row, 2.76px out by the second and worse at other widths (ADR-0556).
//   * A mark that arrived as a class name once painted itself under another surface's sizing
//     rules, which is how one destination ended up drawing two marks (ApparatusRailTab's
//     `iconSrc` doc).
//
// Neither shows up in a unit test, and neither is visible until someone zooms in on a seam.
//
// New states belong on the primitive as props — `disabled`, `locked`, `trailing`, `onSelect`,
// `ariaLabel` and the non-navigating host all arrived by converting a lookalike back into it. If a surface needs something the tab
// cannot express, grow the tab. ADR-0558.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The primitive itself, and the tuner surfaces that TARGET the shipped classes in generated
 *  CSS strings rather than rendering a tab (the dressing rooms exist to retune these very
 *  rules, so naming the selector is their whole job). */
const OWNERS = new Set([
  'ui/shared/ApparatusRailTab.tsx',
  'ui/PagesLibraryStudio.tsx',
  'ui/SurfaceDressingRoom.tsx',
]);

/** No exemptions. The two surfaces that hand-rolled a tab to get a non-button host — the Campaign
 *  Editor's favourite control cannot nest inside a button, and the editor collection tabs select
 *  without an address — are served by the primitive's own role="button" host instead. */
const STRUCTURAL_EXEMPTIONS = new Map();

/** Only markup counts. A comment or a generated CSS string is naming the rule, not building a tab.
 *  Whole class tokens only — `settings-tab-label` is the primitive's own inner span, not a tab. */
const MARKUP = /className=\{?[^\n]*?(?<![\w-])(settings-tab|main-menu-mode-tab|apparatus-rail-column)(?![\w-])/;

export function offendingLines(source) {
  return source
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(({ text }) => MARKUP.test(text));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

export function check(files, read) {
  const failures = [];
  for (const file of files) {
    if (OWNERS.has(file)) continue;
    const hits = offendingLines(read(file));
    if (!hits.length) continue;
    if (STRUCTURAL_EXEMPTIONS.has(file)) continue;
    for (const hit of hits) {
      failures.push(
        `${file}:${hit.line} assembles a rail tab by class name — mount <ApparatusRailTab> instead, `
        + 'and add a prop to it if this surface needs something it cannot express (ADR-0558)',
      );
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-rail-tab-primitive.mjs')) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const files = walk(root).map((full) => path.relative(root, full).split(path.sep).join('/'));
  const failures = check(files, (file) => readFileSync(path.join(root, file), 'utf8'));
  if (failures.length) {
    console.error('✗ check-rail-tab-primitive:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  const exempt = [...STRUCTURAL_EXEMPTIONS.keys()].filter((file) => files.includes(file));
  console.log(
    `✓ check-rail-tab-primitive: every menu-language rail tab is ApparatusRailTab`
    + (exempt.length ? ` (${exempt.length} structural exemption: ${exempt.join(', ')})` : ''),
  );
}
