import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';

/**
 * A declared critical participant must have a registrant. Enforced structurally.
 *
 * `SceneBoundary` now FAILS a scene whose manifest names a critical participant nothing
 * registered, so a manifest can no longer carry aspirational vocabulary — but that failure
 * only surfaces when the route is actually opened. This test is the same rule applied to
 * the whole scene graph at once, which is what stops the drift that produced ADR-0367:
 * six declared ids across six families, none of them registrable, none of them checked.
 *
 * The registrant side is read from source rather than from a hand-kept list, for the same
 * reason `sceneSlots` derives its projection from the scene graph: a second copy drifts.
 */

const UI_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/**
 * Every participant id the UI can register, read off the call sites.
 *
 * Three shapes reach `useSceneParticipant`: a literal id, `PaintedSurfaceBoundary`'s
 * `surface`, and `ThumbnailSurface`'s `participantId`. `ArtRouteChrome` derives
 * `chrome:<className>` from its own class list, so its ids are collected the same way.
 */
function registeredParticipantIds(): Set<string> {
  const ids = new Set<string>();
  const add = (value: string | undefined): void => { if (value) ids.add(value); };
  for (const file of sourceFiles(join(UI_ROOT))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/useSceneParticipant\(\s*'([^']+)'/g)) add(match[1]);
    for (const match of source.matchAll(/\bsurface="([^"]+)"/g)) add(match[1]);
    for (const match of source.matchAll(/\bparticipantId="([^"]+)"/g)) add(match[1]);
    for (const match of source.matchAll(/<ArtRouteChrome[^>]*?\sclassName="([^"]+)"/gs)) add(`chrome:${match[1]}`);
    for (const match of source.matchAll(/\bsceneParticipant="([^"]+)"/g)) add(match[1]);
  }
  return ids;
}

// One address per authored scene family. Sections that share a family's manifest are
// covered by it; what matters is that no family declares an id with no registrant.
const ROUTES = [
  '/', '/unknown', '/party', '/lobbies',
  '/settings', '/settings/general', '/settings/audio/tracks', '/settings/admin',
  '/enchiridion/units', '/enchiridion/cards',
  '/editor', '/editor/wars', '/editor/level',
  '/play/select/skirmish', '/play/select/levels', '/play/select/campaign', '/play',
  '/studio', '/unit-studio', '/prop-lab',
  '/portrait-editor', '/predrawn-reference',
  '/run',
];

describe('critical scene participants', () => {
  const registered = registeredParticipantIds();

  it('finds the participant registrations it reads the graph against', () => {
    // A broken reader would pass every assertion below by finding nothing to contradict.
    for (const id of ['level-editor', 'studio', 'play-selector', 'gameplay-hud', 'chrome:settings-shell']) {
      expect(registered, `expected ${id} among ${registered.size} registrations`).toContain(id);
    }
  });

  it.each(ROUTES)('declares only registrable critical participants for %s', (route) => {
    for (const id of sceneManifest(route).critical) {
      expect(registered, `${route} declares critical participant "${id}" that nothing registers`)
        .toContain(id);
    }
  });

  it('keeps the persistent shell out of every scene declaration', () => {
    // The bar and the shared backdrop render outside every boundary and cannot register
    // there. They are the director's first two ladder rungs (ADR-0367).
    for (const route of ROUTES) {
      const { critical } = sceneManifest(route);
      expect(critical, route).not.toContain('title-bar');
      expect(critical, route).not.toContain('homepage-background');
    }
  });
});
