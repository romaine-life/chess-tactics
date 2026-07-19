import { describe, expect, it } from 'vitest';
import { countIllegalEdges, generateSocketBoard, solveSocketBoard } from './tileBoardGenerator';
import type { TileFamilyId, TileSocketAsset } from './tileSockets';
import type { FeatureKind, RoadMaterial } from './featureAutotile';

type FeatureEntry = { kind: FeatureKind; material: RoadMaterial };
const road = (material: RoadMaterial = 'stone'): FeatureEntry => ({ kind: 'road', material });

const grass: TileSocketAsset = { id: 'grass', kind: 'tile', role: 'base', probability: 1 };
const stone: TileSocketAsset = { id: 'stone', kind: 'tile', role: 'base', probability: 1 };
const water: TileSocketAsset = { id: 'water', kind: 'tile', role: 'base', probability: 1 };

const familyAssets: Record<TileFamilyId, TileSocketAsset[]> = {
  grass: [grass],
  stone: [stone],
  water: [water],
  dirt: [],
  pebble: [],
  sand: [],
};

describe('solveSocketBoard feature layer', () => {
  const grid = (cols: number, rows: number): TileFamilyId[] => Array.from({ length: cols * rows }, () => 'grass' as TileFamilyId);

  it('leaves cells featureless when no featureMap is given (back-compat)', () => {
    const board = solveSocketBoard({ assets: [grass], terrainMap: grid(4, 4), seed: 1, columns: 4, rows: 4, familyAssets });
    expect(board.cells.every((cell) => cell.feature === undefined)).toBe(true);
  });

  it('stamps each featured cell with its kind, material and connection mask, and leaves others bare', () => {
    // An L: (1,1)-(2,1) then down to (2,2). Bend at (2,1), dead-ends at the tips.
    const featureMap = new Map<string, FeatureEntry>([
      ['1,1', road('dirt')],
      ['2,1', road('dirt')],
      ['2,2', road('dirt')],
    ]);
    const board = solveSocketBoard({ assets: [grass], terrainMap: grid(4, 4), seed: 1, columns: 4, rows: 4, familyAssets, featureMap });
    const at = (x: number, y: number) => board.cells.find((cell) => cell.x === x && cell.y === y)!;
    expect(at(1, 1).feature).toEqual({ kind: 'road', material: 'dirt', mask: 0b0010 }); // E only
    expect(at(2, 2).feature).toEqual({ kind: 'road', material: 'dirt', mask: 0b0001 }); // N only
    expect(at(2, 1).feature).toEqual({ kind: 'road', material: 'dirt', mask: 0b1100 }); // S + W (the bend)
    expect(at(0, 0).feature).toBeUndefined();
  });

  it('connects roads of different materials (one shape; surface changes per cell)', () => {
    // (1,1) dirt next to (2,1) stone: they still see each other as road neighbours.
    const featureMap = new Map<string, FeatureEntry>([['1,1', road('dirt')], ['2,1', road('stone')]]);
    const board = solveSocketBoard({ assets: [grass], terrainMap: grid(4, 4), seed: 1, columns: 4, rows: 4, familyAssets, featureMap });
    const at = (x: number, y: number) => board.cells.find((cell) => cell.x === x && cell.y === y)!;
    expect(at(1, 1).feature).toEqual({ kind: 'road', material: 'dirt', mask: 0b0010 }); // sees E neighbour
    expect(at(2, 1).feature).toEqual({ kind: 'road', material: 'stone', mask: 0b1000 }); // sees W neighbour
  });

  it('does not let the feature layer disturb base-terrain selection', () => {
    const map = grid(4, 4);
    const plain = solveSocketBoard({ assets: [grass], terrainMap: map, seed: 7, columns: 4, rows: 4, familyAssets });
    const withRoad = solveSocketBoard({
      assets: [grass], terrainMap: map, seed: 7, columns: 4, rows: 4, familyAssets,
      featureMap: new Map<string, FeatureEntry>([['1,1', road()]]),
    });
    expect(withRoad.cells.map((cell) => cell.asset?.id)).toEqual(plain.cells.map((cell) => cell.asset?.id));
  });
});

describe('generateSocketBoard', () => {
  it('is deterministic for a seed', () => {
    const options = { assets: [grass, stone], seed: 42, columns: 5, rows: 4, familyAssets };
    const first = generateSocketBoard(options).cells.map((cell) => cell.asset?.id ?? cell.missing?.label);
    const second = generateSocketBoard(options).cells.map((cell) => cell.asset?.id ?? cell.missing?.label);
    expect(first).toEqual(second);
  });

  it('falls back to the cell family base at hard edges instead of leaving gaps', () => {
    // No transition tiles in the catalog: a grass/stone boundary has no socket-legal tile,
    // so each cell falls back to its own family base (a hard edge) rather than a missing gap.
    const board = generateSocketBoard({ assets: [grass, stone], seed: 5, columns: 6, rows: 4, familyAssets });
    expect(board.stats.missingPlacements).toBe(0);
    expect(board.cells.every((cell) => cell.asset)).toBe(true);
  });

  it('counts illegal edges in explicit cell lists', () => {
    expect(countIllegalEdges([
      { x: 0, y: 0, asset: grass, terrain: 'grass', sockets: { north: 'grass', east: 'grass', south: 'grass', west: 'grass' } },
      { x: 1, y: 0, asset: stone, terrain: 'stone', sockets: { north: 'stone', east: 'stone', south: 'stone', west: 'stone' } },
    ], familyAssets)).toBe(1);
  });

});
