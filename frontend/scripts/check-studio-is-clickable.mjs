// ADR-0058: a dev surface is a Studio CATEGORY, reachable by clicking. Never a URL-only route.
//
// This gate exists because the rule was written down and then broken five times anyway. The tree
// carried `/studio?runSectioReview=1`, `?lipsanonReview=1`, `?brushIconReview=1`,
// `?runProgressIconReview=1` and `?menuIconReview=1`, each a review surface you could only reach by
// typing its URL — and each one then read as PRECEDENT by the next person building a review
// surface, which is how a sixth got built. Deleting them is not enough on its own: the shape has to
// stop being expressible, or it comes back the next time somebody greps for "how do I add a review
// page".
//
// What is banned: branching the Studio route on a query parameter. A category is registered in
// `catalogCategories` and addressed as `?mode=catalog&cat=<id>`; that address is produced BY the
// clicking, so it is a link to a state the app can actually reach.
//
//   node scripts/check-studio-is-clickable.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../src/ui/App.tsx', import.meta.url));
const STUDIO = fileURLToPath(new URL('../src/ui/TilePreview.tsx', import.meta.url));

const app = readFileSync(APP, 'utf8');
const studio = readFileSync(STUDIO, 'utf8');
const failures = [];

// 1) No Studio route may be keyed on a query parameter.
app.split('\n').forEach((line, index) => {
  const studioRoute = /path === '\/studio'|path === '\/tileset-studio'/.test(line);
  const readsParams = /URLSearchParams|searchParams|\bsearch\b\s*\)/.test(line);
  if (studioRoute && readsParams) {
    failures.push(`src/ui/App.tsx:${index + 1} branches the Studio route on a query parameter:\n    ${line.trim()}`);
  }
});

// 2) Every category the Studio will ANSWER to must also be one a control can SELECT. A `cat=` the
//    guard accepts but no entry renders is the same defect in a smaller form: an address you can
//    only reach by typing it.
const guardLine = studio.split('\n').find((line) => line.includes('const isStudioCategory')) ?? '';
const guarded = [...guardLine.matchAll(/value === '([a-z0-9-]+)'/g)].map((match) => match[1]);
const catalogAt = studio.indexOf('const catalogCategories');
const catalogEnd = catalogAt === -1 ? -1 : studio.indexOf('const activeCatalog', catalogAt);
const catalogBody = catalogAt === -1 || catalogEnd === -1 ? '' : studio.slice(catalogAt, catalogEnd);
const declared = [...catalogBody.matchAll(/\bid: '([a-z0-9-]+)', label: '/g)].map((match) => match[1]);
if (!guarded.length || !declared.length) {
  failures.push('src/ui/TilePreview.tsx: could not read isStudioCategory or catalogCategories — this gate must be repaired, not skipped');
}
for (const id of declared) {
  if (!guarded.includes(id)) {
    failures.push(`src/ui/TilePreview.tsx: category '${id}' is registered but missing from isStudioCategory, so its address cannot round-trip`);
  }
}
// A category is reachable either as a catalog entry or as a viewer the Studio routes to by alias
// (`cardicons` is one of those). What is NOT allowed is an id the guard accepts that nothing in the
// Studio can reach at all — an address with no control behind it.
const elsewhere = studio
  .split('\n')
  .filter((line) => !line.includes('type StudioCategory') && !line.includes('const isStudioCategory'))
  .join('\n');
for (const id of guarded) {
  if (!declared.includes(id) && !elsewhere.includes(`'${id}'`)) {
    failures.push(`src/ui/TilePreview.tsx: '${id}' is accepted by isStudioCategory but nothing in the Studio selects it`);
  }
}

if (failures.length) {
  process.stderr.write(`✗ Studio surfaces must be clickable (ADR-0058):\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  process.stderr.write('  Register a catalogCategories entry instead of a URL-only route.\n');
  process.exit(1);
}
process.stdout.write(`✓ check-studio-is-clickable: ${declared.length} Studio categories, all selectable, no URL-only surfaces.\n`);
