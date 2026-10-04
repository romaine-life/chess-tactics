#!/usr/bin/env node
// GUARD: a Studio destination you cannot CLICK TO cannot exist.
//
// ADR-0058 says a dev surface is reachable by clicking through the running app, and that wiring
// that path is part of building it — "never deferred, and never a question put to the owner". The
// only guard that existed checked one narrow shape: a screen stealing `/studio`'s address with a
// query flag (check-studio-surfaces.mjs). Its success line claimed something much larger — "every
// review surface is a category inside it" — and nothing verified it. So the Mobile Review lab
// shipped reachable only by typing `/mobile-lab`, and the guard stayed green through five
// handovers of that URL.
//
// It was not one miss. When this was finally measured, FOUR of the 42 registered viewer kinds had
// no way in but a hand-typed `?vk=`:
//
//   unitroster, raillab, loading   — registered, implemented, unreachable
//   cardicons                      — registered with no render branch at all, so selecting it fell
//                                    through the viewer chain and quietly showed the Asset Lab
//
// The rule below is the one that makes those impossible rather than merely discouraged: a kind in
// the registry must be opened by an `openViewer()` call, which only a catalog category makes. Add
// a viewer without its way in and the build fails, in the same commit, before it can be handed to
// anyone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = ['ui', 'studioViewerKinds.ts'];
const STUDIO = ['ui', 'TilePreview.tsx'];

/** Every kind the registry declares. */
export function registeredKinds(source) {
  const body = source.slice(
    source.indexOf('STUDIO_VIEWER_KIND_LABELS'),
    source.indexOf('} as const'),
  );
  return [...body.matchAll(/^\s{2}([A-Za-z]+):\s*'/gm)].map((match) => match[1]);
}

/** Every kind the Studio can actually be told to open, and every kind it can render. */
export function studioWiring(source) {
  return {
    opened: new Set([...source.matchAll(/openViewer\('([A-Za-z]+)'\)/g)].map((m) => m[1])),
    rendered: new Set([...source.matchAll(/viewerKind === '([A-Za-z]+)'/g)].map((m) => m[1])),
  };
}

export function check(registrySource, studioSource) {
  const kinds = registeredKinds(registrySource);
  const { opened, rendered } = studioWiring(studioSource);
  const failures = [];
  for (const kind of kinds) {
    if (!rendered.has(kind)) {
      failures.push(
        `viewer kind "${kind}" has no \`viewerKind === '${kind}'\` branch, so selecting it falls `
        + 'through the viewer chain and renders some other surface. Give it a branch, or take it '
        + 'out of STUDIO_VIEWER_KIND_LABELS.',
      );
    }
    if (!opened.has(kind)) {
      failures.push(
        `viewer kind "${kind}" is never opened by \`openViewer('${kind}')\`, so nothing in the `
        + 'Studio can reach it and the only way in is a hand-typed ?vk= (ADR-0058). Add the Open '
        + "action to the catalog category it belongs to in ui/TilePreview.tsx.",
      );
    }
  }
  return failures;
}

if (process.argv[1]?.endsWith('check-studio-reachability.mjs')) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const failures = check(
    readFileSync(path.join(root, ...REGISTRY), 'utf8'),
    readFileSync(path.join(root, ...STUDIO), 'utf8'),
  );
  if (failures.length) {
    console.error('✗ check-studio-reachability: a Studio destination has no way in\n');
    for (const failure of failures) console.error(`  - ${failure}\n`);
    process.exit(1);
  }
  const kinds = registeredKinds(readFileSync(path.join(root, ...REGISTRY), 'utf8'));
  console.log(`✓ check-studio-reachability: all ${kinds.length} viewer kinds render and are reachable by clicking`);
}
