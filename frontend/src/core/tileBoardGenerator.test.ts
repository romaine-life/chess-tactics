import { describe, expect, it } from 'vitest';
import { countIllegalEdges, generateSocketBoard } from './tileBoardGenerator';
import type { TileFamilyId, TileSocketAsset } from './tileSockets';

const grass: TileSocketAsset = { id: 'grass', kind: 'tile', role: 'base', probability: 1 };
const stone: TileSocketAsset = { id: 'stone', kind: 'tile', role: 'base', probability: 1 };
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
  water: [],
};

describe('generateSocketBoard', () => {
  it('is deterministic for a seed', () => {
    const options = { assets: [grass, stone, grassStoneNorth], seed: 42, columns: 5, rows: 4, familyAssets };
    const first = generateSocketBoard(options).cells.map((cell) => cell.asset.id);
    const second = generateSocketBoard(options).cells.map((cell) => cell.asset.id);
    expect(first).toEqual(second);
  });

  it('keeps generated neighboring sockets legal when possible', () => {
    const board = generateSocketBoard({ assets: [grass, stone, grassStoneNorth], seed: 5, columns: 6, rows: 4, familyAssets });
    expect(board.stats.placed).toBe(24);
    expect(board.stats.illegalEdges).toBe(0);
    expect(board.stats.fallbackPlacements).toBe(0);
  });

  it('counts illegal edges in explicit cell lists', () => {
    expect(countIllegalEdges([
      { x: 0, y: 0, asset: grass },
      { x: 1, y: 0, asset: stone },
    ], familyAssets)).toBe(1);
  });
});
