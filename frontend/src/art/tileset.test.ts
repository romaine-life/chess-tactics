import { describe, expect, it } from 'vitest';
import { edgeFeatures, edgeTiles, muralTiles, tileFamilies, type TileAsset } from './tileset';
import type { TileFamilyId } from '../core/tileSockets';

const families: TileFamilyId[] = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];

function expectSource(src: string | undefined): asserts src is string {
  expect(src).toBeTypeOf('string');
}

describe('production tile layer registry', () => {
  it('registers exact top and side files for every stable base tile id', () => {
    for (const family of families) {
      expect(tileFamilies[family]).toHaveLength(8);
      tileFamilies[family].forEach((asset, variant) => {
        expect(asset.id).toBe(`${family}-surf-${variant}`);
        expect('src' in asset).toBe(false);
        expect(asset.topSrc).toBe(`/assets/tiles/surface/${family}-${variant}-top.png`);
        expect(asset.sideSrc).toBe(`/assets/tiles/surface/${family}-${variant}-side.png`);
        expectSource(asset.topSrc);
        expectSource(asset.sideSrc);

        if (family === 'water') {
          expect(asset.topAnimSrc).toBe(`/assets/tiles/surface/${family}-${variant}-top-anim.png`);
          expect(asset.topAnimFrames).toBe(8);
          expectSource(asset.topAnimSrc);
        } else {
          expect(asset.topAnimSrc).toBeUndefined();
          expect(asset.topAnimFrames).toBeUndefined();
        }
      });
    }
  });

  it('registers perimeter, mural, and story art as side-only assets', () => {
    const sideOnly: TileAsset[] = [
      ...Object.values(edgeTiles).flatMap((assets) => assets ?? []),
      ...Object.values(muralTiles).flatMap((assets) => assets ?? []),
      ...edgeFeatures.flatMap((feature) => [...feature.pieces, feature.cap]),
    ];

    expect(sideOnly.length).toBeGreaterThan(0);
    for (const asset of sideOnly) {
      expect('src' in asset).toBe(false);
      expect(asset.topSrc).toBeUndefined();
      expect(asset.topAnimSrc).toBeUndefined();
      expect(asset.sideSrc).toMatch(/-side\.png$/);
      expectSource(asset.sideSrc);
    }
  });
});
