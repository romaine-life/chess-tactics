import { afterEach, describe, expect, it } from 'vitest';
import { applyDrawableCatalog } from '@chess-tactics/board-render';
import { testDrawableCatalog } from '../test/drawableCatalog';
import { defaultTerrainFamily, terrainFamiliesForRole, transitionPairs } from './tileSockets';

describe('database-owned terrain identities', () => {
  afterEach(() => applyDrawableCatalog(testDrawableCatalog()));

  it('projects an identity that exists only in the injected catalog', () => {
    const catalog = testDrawableCatalog();
    for (const asset of catalog.assets) {
      if (asset.kind === 'terrain-family') delete asset.behavior.default;
    }
    catalog.assets.push({
      id: 'test-family-lichen-x', kind: 'terrain-family', label: 'Lichen X', sortOrder: 999,
      lifecycleState: 'active', behavior: { value: 'lichen-x', default: true, roles: ['level-editor-scatter'] },
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
});
