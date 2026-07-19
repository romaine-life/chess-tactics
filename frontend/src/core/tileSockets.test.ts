import { describe, expect, it } from 'vitest';
import {
  baseSocketsForFamily,
  transitionSlotsForPair,
  transitionSocketsForMask,
  tileSocketsForAsset,
  type TileSocketAsset,
  type TileFamilyId,
} from './tileSockets';

const grassStone = { id: 'grass-stone', label: 'Grass-Stone', terrains: ['grass', 'stone'] as [string, string] };
const grassWater = { id: 'grass-water', label: 'Grass-Water', terrains: ['grass', 'water'] as [string, string] };

const familyAssets: Record<TileFamilyId, TileSocketAsset[]> = {
  grass: [{ id: 'grass-a', kind: 'tile', role: 'base', probability: 1 }],
  stone: [{ id: 'stone-a', kind: 'tile', role: 'base', probability: 1 }],
  water: [{ id: 'water-a', kind: 'tile', role: 'base', probability: 1 }],
  dirt: [],
  pebble: [],
  sand: [],
};

describe('tile socket masks', () => {
  it('uses north, east, south, west bit order', () => {
    const sockets = transitionSocketsForMask(0b0011, grassStone);
    expect(sockets).toEqual({
      north: 'grass',
      east: 'grass',
      south: 'stone',
      west: 'stone',
    });
  });

  it('generates the 14 mixed transition slots', () => {
    const slots = transitionSlotsForPair(grassWater, []);
    expect(slots).toHaveLength(14);
    expect(slots[0].code).toBe('0001');
    expect(slots[13].code).toBe('1110');
    expect(slots.some((slot) => slot.code === '0000')).toBe(false);
    expect(slots.some((slot) => slot.code === '1111')).toBe(false);
  });
});

describe('tileSocketsForAsset', () => {
  it('resolves base tiles to same-family edges', () => {
    expect(baseSocketsForFamily('water')).toEqual({
      north: 'water',
      east: 'water',
      south: 'water',
      west: 'water',
    });
    expect(tileSocketsForAsset(familyAssets.grass[0], familyAssets)).toEqual({
      north: 'grass',
      east: 'grass',
      south: 'grass',
      west: 'grass',
    });
  });

});
