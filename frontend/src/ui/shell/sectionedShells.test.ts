import { describe, expect, it } from 'vitest';
import { SECTIONED_SHELLS, type SectionedShell } from './sectionedShells';
import {
  deepestSharedSceneRegion,
  sceneLayerKey,
  sceneManifest,
  type ScenePath,
} from './sceneManifest';
import { createRun } from '../../run/model';
import { createBlankLevel } from '../../core/level';

/**
 * The universal rule, enforced structurally.
 *
 * Whether a navigation fades is decided by scene identity, not by the rail control
 * that requested it. A section missing from the scene key produces an id-equal
 * navigation, `App` takes its same-scene branch, and the director never leaves
 * `is-current` — the Strategikon's rail travelled that way on `/run` for its whole
 * life. Every registered family therefore states its addresses here and this suite
 * walks them: a rail added later fails closed instead of quietly opting out.
 */

const run = createRun({
  id: 'war',
  name: 'War',
  description: 'War',
  battles: [{ level: createBlankLevel('battle', 'Battle', 8, 8), loot: false }],
}, 19, '2026-08-01T00:00:00.000Z');
const runSource = { run: { hydrated: true, document: run } };

type Address = { label: string; path: string; search?: string; sources?: Parameters<typeof sceneManifest>[2] };

const address = (path: string, search = '', sources = {}): Address => ({
  label: `${path}${search}`,
  path,
  search,
  sources,
});

/**
 * One entry per registered shell: the addresses that select each of its sections,
 * and the region that must survive travel between them. Adding a section to the
 * registry without adding its address here fails the coverage check below.
 */
const FAMILIES: ReadonlyArray<{
  shell: string;
  region: string;
  sections: Readonly<Record<string, Address>>;
}> = [
  {
    shell: 'main-menu',
    region: 'menu-shell',
    sections: {
      play: address('/play/select/skirmish'),
      settings: address('/settings/general'),
      enchiridion: address('/enchiridion'),
      'campaign-editor': address('/editor'),
      lobbies: address('/lobbies'),
      party: address('/party'),
    },
  },
  {
    shell: 'settings',
    region: 'settings-shell',
    sections: {
      general: address('/settings/general'),
      audio: address('/settings/audio'),
      tracks: address('/settings/audio/tracks'),
      gameplay: address('/settings/gameplay'),
      'creator-tools': address('/settings/creator-tools'),
      admin: address('/settings/admin'),
    },
  },
  {
    shell: 'enchiridion',
    region: 'enchiridion-shell',
    sections: {
      units: address('/enchiridion/units'),
      terrain: address('/enchiridion/terrain'),
      cards: address('/enchiridion/cards'),
      'card-types': address('/enchiridion/card-types'),
      lipsana: address('/enchiridion/lipsana'),
      abilities: address('/enchiridion/abilities'),
      ataraxia: address('/enchiridion/ataraxia'),
    },
  },
  {
    shell: 'campaign-editor',
    region: 'editor-shell',
    sections: {
      campaign: address('/editor', '?campaign=crown-of-valoria'),
      wars: address('/editor/wars'),
      'skirmish-profiles': address('/editor', '?collection=skirmish-profiles'),
      unassigned: address('/editor', '?collection=unassigned'),
    },
  },
  {
    shell: 'play',
    region: 'play-shell',
    sections: {
      continue: address('/play/select/continue'),
      skirmish: address('/play/select/skirmish'),
      run: address('/play/select/run'),
      levels: address('/play/select/levels'),
      campaign: address('/play/select/campaign/crown-of-valoria'),
    },
  },
  {
    shell: 'play-run',
    region: 'run-detail',
    sections: {
      current: address('/play/select/run/current'),
      new: address('/play/select/run/new'),
    },
  },
  {
    shell: 'strategikon',
    region: 'strategikon-shell',
    sections: {
      enchiridion: address('/run/strategikon/enchiridion', '', runSource),
      prosopography: address('/run/strategikon/prosopography', '', runSource),
      chartulary: address('/run/strategikon/chartulary', '', runSource),
      lipsanotheca: address('/run/strategikon/lipsanotheca', '', runSource),
    },
  },
  {
    shell: 'strategikon-enchiridion',
    region: 'strategikon-reference-shell',
    sections: {
      units: address('/run/strategikon/enchiridion/units', '', runSource),
      terrain: address('/run/strategikon/enchiridion/terrain', '', runSource),
      cards: address('/run/strategikon/enchiridion/cards', '', runSource),
      'card-types': address('/run/strategikon/enchiridion/card-types', '', runSource),
      lipsana: address('/run/strategikon/enchiridion/lipsana', '', runSource),
      abilities: address('/run/strategikon/enchiridion/abilities', '', runSource),
      ataraxia: address('/run/strategikon/enchiridion/ataraxia', '', runSource),
    },
  },
];

const resolve = (entry: Address): ScenePath => sceneManifest(entry.path, entry.search, entry.sources);
const entryById = (id: string): SectionedShell => {
  const found = SECTIONED_SHELLS.find((candidate) => candidate.id === id);
  expect(found, `no registered shell "${id}"`).toBeDefined();
  return found!;
};

describe('sectioned shells', () => {
  it('covers every registered section with an address', () => {
    expect(FAMILIES.map((family) => family.shell).sort())
      .toEqual(SECTIONED_SHELLS.map((entry) => entry.id).sort());
    for (const family of FAMILIES) {
      expect(Object.keys(family.sections).sort(), `sections of "${family.shell}"`)
        .toEqual(entryById(family.shell).sections.map((section) => section.id).sort());
    }
  });

  it('declares the region and slot each family retains', () => {
    for (const family of FAMILIES) {
      const entry = entryById(family.shell);
      expect({ shell: entry.id, region: entry.region }).toEqual({
        shell: family.shell,
        region: family.region,
      });
      // Every section of a shell mounts in that shell's ONE content slot. The
      // director marks that slot's region; a section rendered outside it would be
      // replaced without a transition.
      for (const section of entry.sections) {
        const owner = SECTIONED_SHELLS.find((candidate) => candidate.shell.id === section.definition.id);
        expect(
          owner ? owner.shell.slot : section.definition.slot,
          `section "${section.id}" of "${entry.id}"`,
        ).toBe(entry.contentSlot);
      }
    }
  });

  it('gives every section pair a distinct scene identity', () => {
    for (const family of FAMILIES) {
      const scenes = Object.entries(family.sections)
        .map(([id, entry]) => ({ id, label: entry.label, scene: resolve(entry) }));
      for (const left of scenes) {
        for (const right of scenes) {
          if (left.id === right.id) continue;
          // Equal ids mean App's same-scene branch: the pane swaps with no exit,
          // no entrance, and no fade. This is exactly what the Strategikon did.
          expect(
            { pair: [left.label, right.label], sameId: left.scene.id === right.scene.id },
            `${family.shell}: ${left.id} vs ${right.id}`,
          ).toEqual({ pair: [left.label, right.label], sameId: false });
        }
      }
    }
  });

  it('retains the shell and diverges in its content slot across a section change', () => {
    for (const family of FAMILIES) {
      const entries = Object.entries(family.sections);
      for (const [leftId, left] of entries) {
        for (const [rightId, right] of entries) {
          if (leftId === rightId) continue;
          const from = resolve(left);
          const to = resolve(right);
          const context = `${family.shell}: ${leftId} vs ${rightId}`;

          // The rail's own shell, and everything above it, is retained.
          expect(deepestSharedSceneRegion(from, to), context).toBe(family.region);

          // Everything above the content slot is retained, and the FIRST thing that
          // differs is the instance that slot holds. Deeper instances may differ too
          // (a destination shell brings its own section along), but nothing shallower
          // may — that would mean a section change replaced its own shell.
          const divergence = from.instances
            .findIndex((instance, index) => instance.key !== to.instances[index]?.key);
          expect(divergence, `${context}: no divergence`).toBeGreaterThanOrEqual(0);
          expect(from.instances[divergence].definition.slot, context)
            .toBe(entryById(family.shell).contentSlot);
        }
      }
    }
  });

  it('never re-keys the mounted layer for a Strategikon section change', () => {
    // The Strategikon opens over a live Battle. Re-keying the scene layer would
    // unmount the board behind it, so its slots are identity-only.
    const sections = FAMILIES.find((family) => family.shell === 'strategikon')!.sections;
    const references = FAMILIES.find((family) => family.shell === 'strategikon-enchiridion')!.sections;
    const keys = [...Object.values(sections), ...Object.values(references)]
      .map((entry) => sceneLayerKey(resolve(entry)));
    expect(new Set(keys).size).toBe(1);

    // Battle-hosted too, where the layer key is the gameplay root itself.
    const battle = ['/play/strategikon', '/play/strategikon/enchiridion', '/play/strategikon/enchiridion/units', '/play/strategikon/prosopography', '/play']
      .map((path) => sceneLayerKey(sceneManifest(path)));
    expect(new Set(battle).size).toBe(1);
  });

  it('models bare reference ancestors as retained shells with empty content slots', () => {
    expect(sceneManifest('/enchiridion').instances.map((entry) => entry.definition.id)).toEqual([
      'main-menu',
      'enchiridion',
    ]);
    expect(sceneManifest('/run/strategikon', '', runSource).instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/phase',
      'run/workspace',
      'strategikon',
    ]);
    expect(sceneManifest('/run/strategikon/enchiridion', '', runSource).instances.map((entry) => entry.definition.id)).toEqual([
      'run',
      'run/phase',
      'run/workspace',
      'strategikon',
      'strategikon/enchiridion',
    ]);
  });
});
