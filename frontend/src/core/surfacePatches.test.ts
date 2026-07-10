import { describe, expect, it } from 'vitest';
import {
  generateSurfacePatches,
  surfacePatchAsset,
  surfacePatchAssets,
  surfacePatchCellIndices,
  surfacePatchFrame,
  type SurfacePatchAsset,
} from './surfacePatches';
import type { TileFamilyId } from './tileSockets';

describe('surface patch geometry', () => {
  it('maps a 4x3 footprint to the canonical isometric plane', () => {
    expect(surfacePatchFrame({ columns: 4, rows: 3 })).toEqual({
      left: -144,
      top: -27,
      width: 336,
      height: 189,
    });
  });

  it('covers every static terrain family while animated water remains opt-in later', () => {
    const families = [...new Set(surfacePatchAssets.map((asset) => asset.family))].sort();
    expect(families).toEqual(['dirt', 'grass', 'pebble', 'sand', 'stone']);
  });
});

describe('generateSurfacePatches', () => {
  it('is deterministic and only places non-touching same-family footprints', () => {
    const columns = 10;
    const rows = 10;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const first = generateSurfacePatches({ terrainMap, columns, rows, seed: 412, density: 1 });
    const second = generateSurfacePatches({ terrainMap, columns, rows, seed: 412, density: 1 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);

    const occupied = new Set<number>();
    for (const placement of first) {
      const asset = surfacePatchAsset(placement.assetId)!;
      const cells = surfacePatchCellIndices(placement, columns, rows);
      expect(cells).toHaveLength(asset.columns * asset.rows);
      expect(cells.every((index) => terrainMap[index] === asset.family)).toBe(true);
      for (const index of cells) {
        const x = index % columns;
        const y = Math.floor(index / columns);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const neighbor = (y + dy) * columns + x + dx;
            if (x + dx >= 0 && x + dx < columns && y + dy >= 0 && y + dy < rows) {
              expect(occupied.has(neighbor)).toBe(false);
            }
          }
        }
      }
      cells.forEach((index) => occupied.add(index));
    }
  });

  it('never crosses generated-section boundaries, even when both sections use grass', () => {
    const columns = 8;
    const rows = 4;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const sectionOf = Int32Array.from({ length: columns * rows }, (_, index) => (index % columns < 4 ? 0 : 1));
    const asset: SurfacePatchAsset = {
      id: 'test-grass-2x2',
      label: 'Test grass',
      family: 'grass',
      columns: 2,
      rows: 2,
      src: '/test.png',
      edgeBlendCells: 0.65,
      weight: 1,
    };

    const placements = generateSurfacePatches({ terrainMap, columns, rows, sectionOf, seed: 91, density: 1, assets: [asset] });
    expect(placements.length).toBeGreaterThanOrEqual(2);
    expect(placements.every((placement) => placement.x + asset.columns <= 4 || placement.x >= 4)).toBe(true);
  });

  it('places nothing when surface continuity is disabled', () => {
    const terrainMap = Array<TileFamilyId>(100).fill('grass');
    expect(generateSurfacePatches({ terrainMap, columns: 10, rows: 10, seed: 7, density: 0 })).toEqual([]);
  });

  it('uses the continuity percentage directly instead of silently damping coverage', () => {
    const columns = 20;
    const rows = 20;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const low = generateSurfacePatches({ terrainMap, columns, rows, seed: 77, density: 0.2 });
    const high = generateSurfacePatches({ terrainMap, columns, rows, seed: 77, density: 0.8 });

    const area = (placements: typeof low): number => placements.reduce((sum, placement) => {
      const asset = surfacePatchAsset(placement.assetId)!;
      return sum + asset.columns * asset.rows;
    }, 0);

    expect(area(high)).toBeGreaterThan(area(low));
  });

  it('uses every fitting family variant before repeating one', () => {
    const columns = 12;
    const rows = 12;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const assets: SurfacePatchAsset[] = ['a', 'b', 'c'].map((id) => ({
      id,
      label: id,
      family: 'grass',
      columns: 2,
      rows: 2,
      src: `/${id}.png`,
      edgeBlendCells: 0.65,
      weight: 1,
    }));

    const placements = generateSurfacePatches({ terrainMap, columns, rows, seed: 19, density: 1, assets });
    expect(new Set(placements.map((placement) => placement.assetId))).toEqual(new Set(['a', 'b', 'c']));
  });
});
