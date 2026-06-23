import { describe, expect, it } from 'vitest';
import { countIllegalEdges, generateSocketBoard } from './tileBoardGenerator';
import { transitionPairs } from './tileSockets';
import type { TerrainPairId, TileFamilyId, TileSocketAsset } from './tileSockets';

const grass: TileSocketAsset = { id: 'grass', kind: 'tile', role: 'base', probability: 1 };
const stone: TileSocketAsset = { id: 'stone', kind: 'tile', role: 'base', probability: 1 };
const water: TileSocketAsset = { id: 'water', kind: 'tile', role: 'base', probability: 1 };
const grassStoneNorth: TileSocketAsset = {
  id: 'grass-stone-n',
  kind: 'tile',
  role: 'transition',
  probability: 1,
  pairId: 'grass-stone',
  terrains: ['grass', 'stone'],
  socketMask: 0b0001,
};

const familyAssets: Record<TileFamilyId, TileSocketAsset[]> = {
  grass: [grass],
  stone: [stone],
  water: [water],
  dirt: [],
  pebble: [],
  sand: [],
};

describe('generateSocketBoard', () => {
  it('is deterministic for a seed', () => {
    const options = { assets: [grass, stone, grassStoneNorth], seed: 42, columns: 5, rows: 4, familyAssets };
    const first = generateSocketBoard(options).cells.map((cell) => cell.asset?.id ?? cell.missing?.label);
    const second = generateSocketBoard(options).cells.map((cell) => cell.asset?.id ?? cell.missing?.label);
    expect(first).toEqual(second);
  });

  it('keeps generated neighboring sockets legal when possible', () => {
    const board = generateSocketBoard({ assets: [grass, stone, grassStoneNorth], seed: 5, columns: 6, rows: 4, familyAssets });
    expect(board.stats.placed).toBe(24);
    expect(board.stats.illegalEdges).toBe(0);
    expect(board.stats.missingPlacements).toBeGreaterThanOrEqual(0);
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

  it('stress-tests complete mixed catalogs without illegal or unsupported placements', () => {
    const completeCatalog = [grass, stone, water, ...transitionAssetsForPairs(['grass-stone', 'grass-water', 'stone-water'])];

    for (let seed = 1; seed <= 80; seed += 1) {
      const board = generateSocketBoard({ assets: completeCatalog, seed, columns: 10, rows: 7, familyAssets });

      expect(board.stats.placed).toBe(70);
      expect(board.stats.illegalEdges).toBe(0);
      expect(board.stats.missingPlacements).toBe(0);
      expect(board.cells.some((cell) => cell.missing?.kind === 'unsupported-junction')).toBe(false);
    }
  });

  it('reports missing art without creating illegal neighbor edges', () => {
    const catalogWithMissingArt = [
      grass,
      stone,
      water,
      ...transitionAssetsForPairs(['grass-stone', 'grass-water']),
    ];

    for (let seed = 1; seed <= 40; seed += 1) {
      const board = generateSocketBoard({ assets: catalogWithMissingArt, seed, columns: 10, rows: 7, familyAssets });

      expect(board.stats.illegalEdges).toBe(0);
      expect(board.stats.missingPlacements).toBe(board.cells.filter((cell) => cell.missing).length);
      expect(board.cells.every((cell) => cell.missing?.kind !== 'unsupported-junction')).toBe(true);
    }
  });
});

function transitionAssetsForPairs(pairIds: TerrainPairId[]): TileSocketAsset[] {
  return transitionPairs
    .filter((pair) => pairIds.includes(pair.id))
    .flatMap((pair) =>
      Array.from({ length: 14 }, (_, index) => {
        const mask = index + 1;
        return {
          id: `${pair.id}-${mask.toString(2).padStart(4, '0')}`,
          kind: 'tile',
          role: 'transition',
          probability: 1,
          terrains: pair.terrains,
          pairId: pair.id,
          socketMask: mask,
        } satisfies TileSocketAsset;
      }),
    );
}
