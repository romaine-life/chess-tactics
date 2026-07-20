import { afterEach, describe, expect, it } from 'vitest';
import { applyDrawableCatalog, applyGroundCoverCatalog, defaultSubterrainMaterial, structureArtAsset } from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
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
