import { describe, expect, it } from 'vitest';
import {
  generateMacroTiles,
  macroTileAsset,
  macroTileAssets,
  macroTileCellIndices,
  macroTileFrame,
  resolveMacroTilePlacements,
  type MacroTileAsset,
} from './macroTiles';
import type { TileFamilyId } from './tileSockets';

describe('macrotile geometry', () => {
  it('maps a 4x3 footprint to the canonical isometric plane', () => {
    expect(macroTileFrame({ columns: 4, rows: 3 })).toEqual({
      left: -144,
      top: -27,
      width: 336,
      height: 189,
    });
  });

  it('covers every static terrain family while animated water remains opt-in later', () => {
    const families = [...new Set(macroTileAssets.map((asset) => asset.family))].sort();
    expect(families).toEqual(['dirt', 'grass', 'pebble', 'sand', 'stone']);
  });
});

describe('resolveMacroTilePlacements', () => {
  it('accepts edge-adjacent footprints but rejects overlap deterministically', () => {
    const left = { assetId: 'grass-soft-bands-3x3', x: 0, y: 0 };
    const touching = { assetId: 'grass-soft-bands-3x3', x: 3, y: 0 };
    const overlapping = { assetId: 'grass-soft-bands-3x3', x: 1, y: 0 };
    const resolve = (placements: Array<typeof left>) => resolveMacroTilePlacements({
      placements,
      columns: 6,
      rows: 3,
      familyAt: () => 'grass',
    });

    expect(resolve([touching, left])).toEqual([left, touching]);
    expect(resolve([overlapping, left])).toEqual([left]);
  });

  it('rejects a footprint when any covered cell has the wrong terrain family', () => {
    expect(resolveMacroTilePlacements({
      placements: [{ assetId: 'grass-soft-bands-3x3', x: 0, y: 0 }],
      columns: 3,
      rows: 3,
      familyAt: (x, y) => x === 1 && y === 1 ? 'dirt' : 'grass',
    })).toEqual([]);
  });
});

describe('generateMacroTiles', () => {
  it('is deterministic and only places non-overlapping same-family footprints', () => {
    const columns = 10;
    const rows = 10;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const first = generateMacroTiles({ terrainMap, columns, rows, seed: 412, density: 1 });
    const second = generateMacroTiles({ terrainMap, columns, rows, seed: 412, density: 1 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);

    const occupied = new Set<number>();
    for (const placement of first) {
      const asset = macroTileAsset(placement.assetId)!;
      const cells = macroTileCellIndices(placement, columns, rows);
      expect(cells).toHaveLength(asset.columns * asset.rows);
      expect(cells.every((index) => terrainMap[index] === asset.family)).toBe(true);
      for (const index of cells) {
        expect(occupied.has(index)).toBe(false);
      }
      cells.forEach((index) => occupied.add(index));
    }
  });

  it('allows compatible macrotiles to touch edge-to-edge', () => {
    const asset: MacroTileAsset = {
      id: 'test-grass-2x2',
      label: 'Test grass',
      family: 'grass',
      columns: 2,
      rows: 2,
      src: '/test.png',
      weight: 1,
    };
    const placements = generateMacroTiles({
      terrainMap: Array<TileFamilyId>(8).fill('grass'),
      columns: 4,
      rows: 2,
      seed: 5,
      density: 1,
      assets: [asset],
    });

    expect(placements).toHaveLength(2);
    expect(placements.map((placement) => placement.x).sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('never crosses generated-section boundaries, even when both sections use grass', () => {
    const columns = 8;
    const rows = 4;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const sectionOf = Int32Array.from({ length: columns * rows }, (_, index) => (index % columns < 4 ? 0 : 1));
    const asset: MacroTileAsset = {
      id: 'test-grass-2x2',
      label: 'Test grass',
      family: 'grass',
      columns: 2,
      rows: 2,
      src: '/test.png',
      weight: 1,
    };

    const placements = generateMacroTiles({ terrainMap, columns, rows, sectionOf, seed: 91, density: 1, assets: [asset] });
    expect(placements.length).toBeGreaterThanOrEqual(2);
    expect(placements.every((placement) => placement.x + asset.columns <= 4 || placement.x >= 4)).toBe(true);
  });

  it('places nothing when macrotile coverage is disabled', () => {
    const terrainMap = Array<TileFamilyId>(100).fill('grass');
    expect(generateMacroTiles({ terrainMap, columns: 10, rows: 10, seed: 7, density: 0 })).toEqual([]);
  });

  it('uses the macrotile coverage percentage directly instead of silently damping it', () => {
    const columns = 20;
    const rows = 20;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const low = generateMacroTiles({ terrainMap, columns, rows, seed: 77, density: 0.2 });
    const high = generateMacroTiles({ terrainMap, columns, rows, seed: 77, density: 0.8 });

    const area = (placements: typeof low): number => placements.reduce((sum, placement) => {
      const asset = macroTileAsset(placement.assetId)!;
      return sum + asset.columns * asset.rows;
    }, 0);

    expect(area(high)).toBeGreaterThan(area(low));
  });

  it('uses every fitting family variant before repeating one', () => {
    const columns = 12;
    const rows = 12;
    const terrainMap = Array<TileFamilyId>(columns * rows).fill('grass');
    const assets: MacroTileAsset[] = ['a', 'b', 'c'].map((id) => ({
      id,
      label: id,
      family: 'grass',
      columns: 2,
      rows: 2,
      src: `/${id}.png`,
      weight: 1,
    }));

    const placements = generateMacroTiles({ terrainMap, columns, rows, seed: 19, density: 1, assets });
    expect(new Set(placements.map((placement) => placement.assetId))).toEqual(new Set(['a', 'b', 'c']));
  });
});
