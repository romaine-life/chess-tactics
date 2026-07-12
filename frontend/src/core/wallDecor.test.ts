import { describe, expect, it } from 'vitest';
import {
  WALL_DECOR_ASSETS,
  WALL_DECOR_KIND_LABELS,
  WALL_DECOR_KINDS,
} from './wallDecor';

const MIRROR_IDS = [
  'mirror-keep',
  'mirror-court-oval',
  'mirror-chapel-glass',
  'mirror-witch-eye',
  'mirror-grand-gallery',
] as const;

describe('wall decor catalog', () => {
  it('exposes mirrors as a labeled catalog kind', () => {
    expect(WALL_DECOR_KINDS).toContain('mirror');
    expect(WALL_DECOR_KIND_LABELS.mirror).toBe('Mirrors');
  });

  it('catalogs the anchor mirror set under the mirror kind', () => {
    const assetsById = new Map(WALL_DECOR_ASSETS.map((asset) => [asset.id, asset]));

    for (const id of MIRROR_IDS) {
      const asset = assetsById.get(id);
      expect(asset?.kind, id).toBe('mirror');
      if (asset?.kind !== 'mirror') continue;
      for (const face of ['west', 'north'] as const) {
        expect(asset.faces[face].glassSrc, `${id}/${face}`).toMatch(/-glass\.png$/);
        expect(asset.faces[face].aperture.length, `${id}/${face}`).toBeGreaterThanOrEqual(6);
      }
    }
  });
});
