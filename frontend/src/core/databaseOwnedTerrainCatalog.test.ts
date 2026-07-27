import { afterEach, describe, expect, it } from 'vitest';
import {
  DOODAD_ASSETS,
  PROP_DEFS,
  applyDrawableCatalog,
  applyGroundCoverCatalog,
  applyPropSeats,
  defaultSubterrainMaterial,
  structureArtAsset,
  structureArtDirectionHalfSrc,
  structureArtDirections,
  structureArtHasCompleteTurntable,
  structureArtDirectionSplitMode,
  structureArtDirectionSprite,
  structureArtHalfSrc,
} from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
import { TEST_PROP_SEATS } from '../test/livePropSeats';
import { assertPropSeatMap } from './props';
import { defaultTerrainFamily, familyForGameplayTerrain, gameplayTerrainForFamily, terrainFamiliesForRole, transitionPairs } from './tileSockets';

describe('database-owned terrain identities', () => {
  afterEach(() => applyDrawableCatalog(testDrawableCatalog()));

  it('projects an identity that exists only in the injected catalog', () => {
    const catalog = testDrawableCatalog();
    for (const asset of catalog.assets) {
      if (asset.kind === 'terrain-family') delete asset.behavior.default;
    }
    catalog.assets.push({
      id: 'test-family-lichen-x', kind: 'terrain-family', label: 'Lichen X', sortOrder: 999,
      lifecycleState: 'active', behavior: { value: 'lichen-x', default: true, roles: ['level-editor-scatter'], gameplayTerrain: 'grass', rendersGameplayTerrains: ['grass'] },
      metadata: {}, rowRevision: 1, media: {},
    }, {
      id: 'test-transition-lichen-x-ash-y', kind: 'terrain-transition', label: 'Lichen X / Ash Y', sortOrder: 999,
      lifecycleState: 'active', behavior: { value: 'lichen-x-ash-y', terrains: ['lichen-x', 'ash-y'] },
      metadata: {}, rowRevision: 1, media: {},
    });
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });

    expect(defaultTerrainFamily().id).toBe('lichen-x');
    expect(terrainFamiliesForRole('level-editor-scatter').some((family) => family.id === 'lichen-x')).toBe(true);
    expect(transitionPairs.some((pair) => pair.id === 'lichen-x-ash-y')).toBe(true);
  });

  it('projects gameplay conversion from database behavior without a compiled family map', () => {
    const catalog = testDrawableCatalog();
    const grass = catalog.assets.find((asset) => asset.kind === 'terrain-family' && asset.behavior.value === 'grass')!;
    const dirt = catalog.assets.find((asset) => asset.kind === 'terrain-family' && asset.behavior.value === 'dirt')!;
    grass.behavior.gameplayTerrain = 'dirt';
    grass.behavior.rendersGameplayTerrains = ['dirt'];
    dirt.behavior.gameplayTerrain = 'grass';
    dirt.behavior.rendersGameplayTerrains = ['grass'];
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(gameplayTerrainForFamily('grass')).toBe('dirt');
    expect(familyForGameplayTerrain('grass')).toBe('dirt');
  });

  it('projects an opaque structure identity and its required configuration from the database alone', () => {
    const catalog = testDrawableCatalog();
    const source = catalog.assets.find((asset) => asset.id === 'structure-oak')!;
    catalog.assets.push({
      ...structuredClone(source), id: 'opaque-structure-7f2', label: 'Opaque structure', sortOrder: 999,
      behavior: { ...structuredClone(source.behavior), value: 'opaque-structure-value-7f2' },
    });
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(structureArtAsset('opaque-structure-value-7f2')).toMatchObject({
      id: 'opaque-structure-value-7f2', label: 'Opaque structure', blocking: true, splitMode: 'authored',
    });
  });

  it('offers only complete rendered direction pairs and consumes per-view contact calibration', () => {
    const catalog = testDrawableCatalog();
    const source = catalog.assets.find((asset) => asset.id === 'structure-oak')!;
    const directionalRole = (half: 'back' | 'front', fill: string) => {
      const role = structuredClone(source.media[half]);
      role.slot = `props/oak/east-${half}.png`;
      role.media.sha256 = fill.repeat(64);
      role.media.immutableUrl = `/api/media/${role.media.sha256}`;
      role.media.url = `/assets/props/oak/east-${half}.png`;
      role.media.width = 210;
      role.media.height = 280;
      return role;
    };
    source.media['east-back'] = directionalRole('back', 'a');
    source.media['east-front'] = directionalRole('front', 'b');
    source.media['north-back'] = directionalRole('back', 'c');
    source.behavior.directions = {
      east: { anchorX: 88, anchorY: 244, scale: 0.75, splitMode: 'flat-contact' },
    };
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });

    expect(structureArtDirections('oak')).toEqual(['east', 'south']);
    expect(structureArtHasCompleteTurntable('oak')).toBe(false);
    expect(structureArtDirectionSprite('oak', 'east')).toEqual({
      w: 210,
      h: 280,
      anchorX: 88,
      anchorY: 244,
      scale: 0.75,
    });
    expect(structureArtDirectionHalfSrc('oak', 'east', 'front')).toBe(`/api/media/${'b'.repeat(64)}`);
    expect(structureArtDirectionSplitMode('oak', 'east')).toBe('flat-contact');
    expect(structureArtDirectionSplitMode('oak', 'south')).toBe('authored');
    expect(structureArtDirectionSprite('oak', 'north')).toBeUndefined();
  });

  it('reads source-only landmark turntables without synthesizing gameplay props or doodads', () => {
    const catalog = testDrawableCatalog();
    const source = structuredClone(catalog.assets.find((asset) => asset.id === 'structure-oak')!);
    const directions = [
      'south', 'south-west', 'west', 'north-west',
      'north', 'north-east', 'east', 'south-east',
    ];
    const media = Object.fromEntries(directions.flatMap((direction, index) => {
      const role = structuredClone(source.media.back);
      const hashDigit = (index + 1).toString(16);
      role.slot = `source-art/castle-ruin/${direction}.png`;
      role.media.sha256 = hashDigit.repeat(64);
      role.media.immutableUrl = `/api/media/${role.media.sha256}`;
      role.media.url = `/assets/${role.slot}`;
      role.media.width = 512;
      role.media.height = 512;
      return [[`${direction}-back`, structuredClone(role)], [`${direction}-front`, structuredClone(role)]];
    }));
    catalog.assets.push({
      ...source,
      id: 'structure-castle-ruin',
      label: 'Castle ruin',
      behavior: {
        value: 'castle-ruin',
        structureKind: 'landmark',
        sourceOnly: true,
        anchorX: 256,
        anchorY: 256,
        scale: 0.4,
        splitMode: 'flat-contact',
      },
      media,
    }, {
      ...source,
      id: 'structure-source-doodad',
      label: 'Source-only doodad',
      behavior: {
        value: 'source-doodad',
        structureKind: 'doodad',
        sourceOnly: true,
        anchorX: 256,
        anchorY: 256,
        scale: 0.4,
        splitMode: 'flat-contact',
      },
      media: structuredClone(media),
    });
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });

    expect(structureArtAsset('castle-ruin')).toMatchObject({
      kind: 'landmark',
      sourceOnly: true,
      terrains: [],
      blocking: false,
      sprite: { w: 512, h: 512 },
    });
    expect(structureArtHalfSrc('castle-ruin', 'back')).toBe(media['south-back'].media.immutableUrl);
    expect(structureArtHasCompleteTurntable('castle-ruin')).toBe(true);
    expect(() => assertPropSeatMap(TEST_PROP_SEATS)).not.toThrow();
    expect(() => applyPropSeats(structuredClone(TEST_PROP_SEATS))).not.toThrow();
    expect(PROP_DEFS.some((definition) => definition.id === 'castle-ruin')).toBe(false);
    expect(DOODAD_ASSETS.some((asset) => asset.id === 'source-doodad')).toBe(false);
  });

  it('fails closed for missing structure and ground-cover behavior instead of filling code defaults', () => {
    const catalog = testDrawableCatalog();
    const structure = catalog.assets.find((asset) => asset.id === 'structure-oak')!;
    delete structure.behavior.blocking;
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(() => structureArtAsset('oak')).toThrow(/lacks placement behavior/);

    const second = testDrawableCatalog();
    const cover = second.assets.find((asset) => asset.id === 'ground-cover-grass')!;
    delete cover.behavior.count;
    applyDrawableCatalog({ ...second, revision: second.revision + 2 });
    expect(() => applyGroundCoverCatalog()).toThrow(/lacks terrain, variants, edgeOnly, or count/);
  });

  it('uses the database-marked Subterrain default', () => {
    const catalog = testDrawableCatalog();
    for (const asset of catalog.assets) if (asset.kind === 'subterrain') asset.behavior.default = asset.id === 'roots';
    applyDrawableCatalog({ ...catalog, revision: catalog.revision + 1 });
    expect(defaultSubterrainMaterial()).toBe('roots');
  });
});
