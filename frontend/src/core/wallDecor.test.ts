import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WALL_DECOR_ASSETS, WALL_DECOR_KIND_LABELS, WALL_DECOR_KINDS } from '@chess-tactics/board-render';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';

const MIRROR_IDS = [
  'test-mirror-keep',
  'test-mirror-court-oval',
  'test-mirror-chapel-glass',
  'test-mirror-witch-eye',
  'test-mirror-grand-gallery',
] as const;

beforeAll(() => applyTestDrawableCatalog());
afterAll(() => applyTestDrawableCatalog());

describe('wall decor catalog', () => {
  it('exposes mirrors as a labeled catalog kind', () => {
    expect(WALL_DECOR_KINDS).toContain('mirror');
    expect(WALL_DECOR_KIND_LABELS.mirror).toBe('Mirrors');
  });

  it('allows framework introspection without treating object properties as catalog identities', () => {
    expect(WALL_DECOR_KIND_LABELS.constructor).toBe(Object);
    expect(WALL_DECOR_KIND_LABELS[Symbol.toStringTag as unknown as string]).toBeUndefined();
  });

  it('catalogs the anchor mirror set under the mirror kind', () => {
    const assetsById = new Map(WALL_DECOR_ASSETS.map((asset) => [asset.id, asset]));

    for (const id of MIRROR_IDS) {
      const asset = assetsById.get(id);
      expect(asset?.kind, id).toBe('mirror');
      if (asset?.kind !== 'mirror') continue;
      for (const face of ['west', 'north'] as const) {
        expect(asset.faces[face].glassSrc, `${id}/${face}`).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
        expect(asset.faces[face].aperture.length, `${id}/${face}`).toBeGreaterThanOrEqual(6);
      }
    }
  });
});
