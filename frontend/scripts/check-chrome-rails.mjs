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
 * Who may render a bare `<ChromeDivider>` at all — and by now, nothing that builds a screen.
 *
 * A rail is placed by the element that owns the frame its ends meet, and there are exactly two of
 * those: the divided grid, which computes its whole junction graph from its grid lines, and
 * ShellControlsPanel, whose own frame is what the break under its fixed head runs into. Both live
 * in the shared chrome and neither takes a rail from a caller. The remaining two entries are the
 * kit's display cases, where a divider IS the subject on the page rather than chrome in a screen.
 *
 * This list used to carry feature files, and that was the hole: it encoded a judgement about who
 * could be trusted with a rail. Nobody is trusted with one now. A surface that needs to separate
 * things asks its box for members, and the box lays the rails and their caps.
 */
const DIVIDER_OWNERS = new Set([
  'ui/shared/ChromeDividedGrid.tsx',
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
console.log(`✓ chrome rails: only the divided grid, the controls panel and ${DIVIDER_OWNERS.size - 1} kit display cases may draw one; every screen asks its box for members.`);
