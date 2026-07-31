import { describe, expect, it } from 'vitest';
import { macroTileAsset, macroTileCellIndices } from '../core/macroTiles';
import { defaultTerrainFamily, gameplayTerrainForFamily } from '../core/tileSockets';
import { generateTerrainDressing } from './generatedReferenceBoard';
import { studioFamilies } from './studioBoard';

const familyOfTile = (tileId: string): string | undefined =>
  studioFamilies.find((family) => family.assets.some((asset) => asset.id === tileId))?.id;

describe('generateTerrainDressing', () => {
  const cols = 7;
  const rows = 7;
  const keepClear = new Set(['3,3', '2,2', '4,4', '3,0', '3,6', '0,3', '6,3']);

  it('is deterministic in seed', () => {
    const opts = { cols, rows, seed: 42, keepClear };
    expect(generateTerrainDressing(opts)).toEqual(generateTerrainDressing(opts));
  });

  it('fills every cell with walkable terrain — never water', () => {
    for (const seed of [1, 7, 42, 101, 999]) {
      const dressing = generateTerrainDressing({ cols, rows, seed, keepClear });
      for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
        const family = familyOfTile(dressing.cells[`${x},${y}`]);
        expect(family, `cell ${x},${y} seed ${seed}`).toBeDefined();
        expect(gameplayTerrainForFamily(family!)).not.toBe('water');
      }
    }
  });

  it('keeps cleared cells on calm default terrain: no accents, cover, or macro tops', () => {
    for (const seed of [1, 7, 42, 101, 999]) {
      const dressing = generateTerrainDressing({ cols, rows, seed, keepClear });
      const clearIndices = new Set([...keepClear].map((key) => {
        const [x, y] = key.split(',').map(Number);
        return y * cols + x;
      }));
      for (const key of keepClear) {
        expect(familyOfTile(dressing.cells[key]), `cell ${key} seed ${seed}`).toBe(defaultTerrainFamily().id);
        expect(dressing.cover[key]).toBeUndefined();
        expect(dressing.coverTypes[key]).toBeUndefined();
      }
      for (const placement of dressing.macroTiles) {
        const asset = macroTileAsset(placement.assetId);
        expect(asset).toBeDefined();
        for (const index of macroTileCellIndices(placement, cols, rows)) {
          expect(clearIndices.has(index), `macro ${placement.assetId} seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('keeps the default family dominant — accents are dressing, not the board', () => {
    for (const seed of [1, 7, 42, 101, 999]) {
      const dressing = generateTerrainDressing({ cols, rows, seed, keepClear });
      const accentCells = Object.values(dressing.cells)
        .filter((tileId) => familyOfTile(tileId) !== defaultTerrainFamily().id).length;
      expect(accentCells, `seed ${seed}`).toBeLessThanOrEqual(Math.ceil(cols * rows * 0.3));
    }
  });
});
