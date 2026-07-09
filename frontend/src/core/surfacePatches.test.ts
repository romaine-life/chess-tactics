import { describe, expect, it } from 'vitest';
import {
  generateSurfacePatches,
  surfacePatchAsset,
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
});
