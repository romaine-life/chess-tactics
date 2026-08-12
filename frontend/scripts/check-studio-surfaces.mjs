#!/usr/bin/env node
// GUARD: `/studio` routes to the Studio, and to nothing else. A review surface is a Studio
// CATEGORY, never its own screen wearing the Studio's address.
//
// Why this exists: six surfaces bolted themselves onto the Studio's path — `/studio?brushIconReview=1`,
// `?menuIconReview=1`, `?runProgressIconReview=1`, `?runSectioReview=1`, `?lipsanonReview=1`,
// `?terrainMarkReview=1`. Each was matched in App.tsx BEFORE the Studio rendered and returned its
// own `<main>`, so it got the Studio's URL and none of the Studio:
//
//   * no category rail, so it was unreachable by clicking and could only be opened from a URL
//     someone handed you — the exact failure ADR-0058 named for Studio entries;
//   * no Controls panel, so each grew a private layout that matched nothing else in the app;
//   * a second `useSceneParticipant('studio')` beside the Studio's own, holding the scene on a
//     fetch the shell already covers.
//
// The pattern was available and copied: every one of the six was written by copying the last one.
// Availability is not enforcement, so this is enforced. A legacy address still WORKS — the Studio's
// own route reader maps the old flag onto its category and the route writer drops it — but no NEW
// screen can take the address, because App.tsx may not name `/studio` beside a query at all.
//
// If a surface needs something a category cannot express, grow the category contract in
// TilePreview.tsx (`main` and `controls` are both arbitrary elements). ADR-0588.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Route branches that pair the Studio's path with a query parameter. `/studio` may be routed
 *  once, bare, to the Studio itself; anything else keyed on the same path is a bolt-on. */
const BOLT_ON = /path === '\/studio'\s*&&/;

/** The Studio's own aliases are PATHS, not query flags, and each canonicalises into `?cat=`/`?vk=`
 *  inside the Studio's route reader. They are entry points, not screens, so they are not matched
 *  by the rule above and need no exemption. */

export function offendingLines(source) {
  return source
    .split('\n')
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter(({ text }) => BOLT_ON.test(text));
}

export function check(source) {
  return offendingLines(source).map((hit) => (
    `ui/App.tsx:${hit.line} routes /studio on a query parameter, which returns a screen before the `
    + 'Studio renders — so it has no category rail, no Controls panel and no way in but a '
    + 'hand-passed URL. Add a StudioCategory in ui/TilePreview.tsx instead (ADR-0588):\n'
    + `      ${hit.text}`
  ));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-studio-surfaces.mjs')) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const failures = check(readFileSync(path.join(root, 'ui', 'App.tsx'), 'utf8'));
  if (failures.length) {
    console.error('✗ check-studio-surfaces:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log('✓ check-studio-surfaces: /studio routes the Studio; every review surface is a category inside it');
}
