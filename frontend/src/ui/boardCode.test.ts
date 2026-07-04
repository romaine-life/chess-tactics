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
});
