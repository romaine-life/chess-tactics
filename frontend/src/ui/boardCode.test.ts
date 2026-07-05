import { describe, expect, it } from 'vitest';
import { encodeBoard, decodeBoard, type EditorBoard } from './boardCode';

const emptyBoard = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6,
  rows: 5,
  cells: {},
  units: {},
  doodads: {},
  cover: {},
  props: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  ...over,
});

describe('boardCode round-trip', () => {
  it('preserves a mixed board of tiles, a river, a road, and edge fences', () => {
    const board = emptyBoard({
      cells: { '0,0': 'grass-surf-0', '2,2': 'water-surf-0' },
      features: {
        '2,1': { kind: 'river', material: 'water' },
        '4,4': { kind: 'road', material: 'cobble' },
      },
      fences: { '1,1|2,1': 'wood', '3,3|3,4': 'stone' },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded).not.toBeNull();
    expect(decoded!.features).toEqual(board.features);
    expect(decoded!.fences).toEqual(board.fences);
  });

  it('encodes a fence-free board byte-identically to a code that predates fences', () => {
    expect(encodeBoard(emptyBoard({ fences: {} }))).toBe(encodeBoard(emptyBoard()));
    // an old code with no `fe` decodes fences to an empty map (back-compat contract).
    expect(decodeBoard(encodeBoard(emptyBoard()))!.fences).toEqual({});
  });

  it('round-trips faction default directions', () => {
    const board = emptyBoard({
      factionDirections: { 'navy-blue': 'north', crimson: 'south-east' },
    });
    expect(decodeBoard(encodeBoard(board))!.factionDirections).toEqual(board.factionDirections);
  });

  it('encodes a direction-default-free board byte-identically to a code that predates faction directions', () => {
    expect(encodeBoard(emptyBoard({ factionDirections: {} }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.factionDirections).toEqual({});
  });

  it('round-trips generated-region units and their rerun settings', () => {
    const generatedRegions: EditorBoard['generatedRegions'] = [{
      id: 'region-1',
      name: 'North pond',
      cells: ['1,1', '2,1', '1,2'],
      buffer: 12,
      wiggle: 0.35,
      sections: [
        {
          terrain: 'water',
          share: 70,
          locked: true,
          covers: [{ type: 'water', knobs: { amount: 0.8, amountRandom: 0.1, density: 0.5, densityRandom: 0.2 } }],
        },
        { terrain: 'sand', share: 30, covers: [] },
      ],
    }];
    expect(decodeBoard(encodeBoard(emptyBoard({ generatedRegions })))!.generatedRegions).toEqual(generatedRegions);
  });

  it('encodes a generated-region-free board byte-identically to a code that predates region units', () => {
    expect(encodeBoard(emptyBoard({ generatedRegions: [] }))).toBe(encodeBoard(emptyBoard()));
    expect(decodeBoard(encodeBoard(emptyBoard()))!.generatedRegions).toEqual([]);
  });
});
