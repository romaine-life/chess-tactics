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
  it('preserves a mixed board of tiles, a river, and a bridge with its orientation', () => {
    const board = emptyBoard({
      cells: { '0,0': 'grass-surf-0', '2,2': 'water-surf-0' },
      features: {
        '2,1': { kind: 'river', material: 'water' },
        '2,2': { kind: 'bridge', material: 'stone', orientation: 'h' },
        '3,2': { kind: 'bridge', material: 'stone', orientation: 'v' },
        '4,4': { kind: 'road', material: 'cobble' },
      },
    });
    const decoded = decodeBoard(encodeBoard(board));
    expect(decoded).not.toBeNull();
    expect(decoded!.features).toEqual(board.features);
  });

  it('keeps each bridge cell axis distinct (h vs v survive the wire)', () => {
    const board = emptyBoard({
      features: {
        '1,1': { kind: 'bridge', material: 'stone', orientation: 'h' },
        '1,2': { kind: 'bridge', material: 'stone', orientation: 'v' },
      },
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.features['1,1'].orientation).toBe('h');
    expect(decoded.features['1,2'].orientation).toBe('v');
    expect(decoded.features['1,1'].kind).toBe('bridge');
  });
});
