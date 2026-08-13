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

import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * SECOND RULE: a catalog's own wrapper must be the Studio's scroll owner.
 *
 * The shell is `overflow: hidden` at the viewport's height and hands the scroll to its DIRECT
 * content child. Almost every category returns `.tileset-studio-grid`, which that rule names; a
 * category that needs a wrapper — because it shows something above its grid — has to be named
 * there too, and if it is not, its content clips at the shell's height with no way to reach the
 * rest. There is no error and nothing looks broken: the page simply ends.
 *
 * It has now cost two surfaces. Log Marks lost half its candidates, and HUD Tab Marks stranded
 * eighty of them below the fold. The style.css comment asked the next wrapper to join the rule,
 * which is availability rather than enforcement — so this enforces it.
 *
 * Keyed on the `-page` suffix the wrappers already share. A catalog wrapper named anything else
 * is outside this net, which is the cost of not parsing JSX; the convention is cheap to keep.
 */
const CATALOG_WRAPPER = /className="([a-z][a-z-]*-page)"/g;
const SCROLL_OWNER_RULE = /\.tileset-studio-shell\.is-catalog > \.[^{]+\{[^}]*overflow-y:\s*auto/;

export function scrollOwnerFailures(catalogSources, css) {
  const rule = css.match(SCROLL_OWNER_RULE)?.[0] ?? '';
  const named = new Set([...rule.matchAll(/> \.([a-z][a-z-]*)/g)].map((hit) => hit[1]));
  const failures = [];
  for (const [file, source] of catalogSources) {
    for (const hit of source.matchAll(CATALOG_WRAPPER)) {
      const wrapper = hit[1];
      if (named.has(wrapper)) continue;
      failures.push(
        `ui/${file} wraps its catalog in .${wrapper}, which the Studio's scroll-owner rule does not `
        + 'name — so everything past the shell height clips with no way to reach it. Add '
        + `".tileset-studio-shell.is-catalog > .${wrapper}" to that rule in style.css.`,
      );
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-studio-surfaces.mjs')) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const uiDir = path.join(root, 'ui');
  const catalogSources = readdirSync(uiDir)
    .filter((name) => name.endsWith('Catalog.tsx'))
    .map((name) => [name, readFileSync(path.join(uiDir, name), 'utf8')]);
  const failures = [
    ...check(readFileSync(path.join(uiDir, 'App.tsx'), 'utf8')),
    ...scrollOwnerFailures(catalogSources, readFileSync(path.join(root, 'style.css'), 'utf8')),
  ];
  if (failures.length) {
    console.error('✗ check-studio-surfaces:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `✓ check-studio-surfaces: /studio routes the Studio, every review surface is a category inside it, `
    + `and all ${catalogSources.length} catalogs' wrappers can scroll`,
  );
}
