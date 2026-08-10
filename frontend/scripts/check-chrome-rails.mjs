#!/usr/bin/env node
// A rail's ends are meetings with the frame around it, and only the element that owns that frame
// knows where they are. So the parts that let a rail be drawn with its caps decided elsewhere are
// private, and the boxes that hold several things lay their own rails from a typed member list.
//
// This guard exists because none of that was true once: `ChromeDivider` took a public
// `junctions="none"`, every box took `children: ReactNode`, and a hand-placed rail shipped into
// Settings with nothing capping either end. The fix was to make that unsayable; this is the
// backstop that keeps it unsayable.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const src = join(frontend, 'src');

/** Only the divided grid may draw a rail whose caps are placed by something else. */
const RAIL_INTERNALS_OWNERS = new Set([
  'ui/shared/ChromeDividedGrid.tsx',
]);

/**
 * Who may render a bare `<ChromeDivider>` at all. Everything here OWNS a boundary and can say where
 * the rail's ends are: the divided grid, a row that splits itself into compartments, the select
 * menu's own box, the editor rail's fixed/dynamic seam, and the two surfaces whose SUBJECT is the
 * kit itself. A feature screen is not on this list — it asks its box for members instead.
 */
const DIVIDER_OWNERS = new Set([
  'ui/shared/ChromeDividedGrid.tsx',
  'ui/shared/ActionList.tsx',
  'ui/shared/HouseSelect.tsx',
  'ui/LevelEditorChromeConsumers.tsx',
  'ui/ChromeLab.tsx',
  'ui/ChromeUnitAudit.tsx',
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [absolute] : [];
  });
}

const failures = [];

for (const absolute of sourceFiles(src)) {
  const path = relative(src, absolute).split(sep).join('/');
  const source = readFileSync(absolute, 'utf8');
  if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue;

  if (/from '[^']*chromeRailInternals'/.test(source) && !RAIL_INTERNALS_OWNERS.has(path)) {
    failures.push(`${path}: imports chromeRailInternals. Only ${[...RAIL_INTERNALS_OWNERS].join(', ')} may — a rail whose caps are placed elsewhere needs a topology that knows where they go.`);
  }

  if (/<ChromeDivider\b/.test(source) && !DIVIDER_OWNERS.has(path) && path !== 'ui/shared/ChromeBox.tsx') {
    failures.push(`${path}: renders <ChromeDivider> directly. To separate things inside a box, give the box typed \`members\` and it lays the rails and their junction caps itself (SectionBox).`);
  }

  // The prop is gone from the public type; catch a re-introduction before it can be passed again.
  // Lookbehind excludes the `data-chrome-divider-junctions` ATTRIBUTE, which the rail components
  // and the generated role CSS both write — that one is the rendered result, not a caller's choice.
  if (/(?<![-\w])junctions=/.test(source) && path !== 'ui/shared/chromeRailInternals.tsx') {
    failures.push(`${path}: passes a \`junctions\` prop. Suppressing a rail's own end caps is not a decision a call site can make; it belongs to the topology that owns the boundary.`);
  }
}

if (!/data-chrome-divider-junctions="endpoints"/.test(readFileSync(join(src, 'ui/shared/ChromeBox.tsx'), 'utf8'))) {
  failures.push('ui/shared/ChromeBox.tsx: the public ChromeDivider must always draw its own endpoints.');
}
if (/junctions\?:/.test(readFileSync(join(src, 'ui/shared/ChromeBox.tsx'), 'utf8'))) {
  failures.push('ui/shared/ChromeBox.tsx: the public ChromeDivider must not accept a junctions prop.');
}

const sectionBox = readFileSync(join(src, 'ui/shared/SectionBox.tsx'), 'utf8');
if (!/members: readonly SectionBoxMember\[\]/.test(sectionBox) || !/children\?: never/.test(sectionBox)) {
  failures.push('ui/shared/SectionBox.tsx: a box of several things must take a typed member list, and must not also accept children — the space BETWEEN members is the box\'s to lay.');
}

if (failures.length) {
  console.error('\n✗ Chrome rail ownership gate FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ chrome rails: ${DIVIDER_OWNERS.size} boundary owners may draw one; every other surface asks its box for members.`);
