import { describe, it, expect } from 'vitest';
import { encodeBoard, decodeBoard, type EditorBoard } from './boardCode';

const base = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6, rows: 6, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {}, zones: {}, ...over,
});

describe('boardCode — zones wire key (z)', () => {
  it('encode -> decode round-trips the zones map identically', () => {
    const board = base({
      zones: { '0,0': 'player-spawn', '5,5': 'enemy-spawn', '2,3': 'objective' },
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zones).toEqual(board.zones);
  });

  it('a zone-free board encodes byte-identically to a pre-zones code', () => {
    // The same board minus the zones field — i.e. what an OLD client produced. The encoded string
    // must match exactly, proving `z` is omitted when empty (no silent format churn), the same
    // discipline props (`p`) follows.
    const withEmptyZones = base({ cells: { '0,0': 'grass-1' }, zones: {} });
    const legacy = { ...withEmptyZones } as Partial<EditorBoard>;
    delete legacy.zones;
    expect(encodeBoard(withEmptyZones)).toBe(encodeBoard(legacy as EditorBoard));
  });

  it('decoding a LEGACY code with no `z` yields an empty zones map (back-compat contract)', () => {
    // Encode a board that predates the zones channel (no zones key at all), then decode it: the
    // channel must come back present-but-empty, never undefined, so consumers can read it freely.
    const legacy = { ...base({ cells: { '1,1': 'grass-1' } }) } as Partial<EditorBoard>;
    delete legacy.zones;
    const decoded = decodeBoard(encodeBoard(legacy as EditorBoard))!;
    expect(decoded.zones).toEqual({});
  });

  it('zones coexist with props/units and round-trip independently', () => {
    const board = base({
      units: { '0,0': { unitId: 'rook', direction: 'south', faction: 'navy-blue' } },
      props: { '2,2': { propId: 'oak' } },
      zones: { '4,4': 'player-spawn' },
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.units).toEqual(board.units);
    expect(decoded.props).toEqual(board.props);
    expect(decoded.zones).toEqual(board.zones);
  });

  it('preserves a non-editor zone type (enemy-threat) so the channel stays lossless', () => {
    // The channel stores the full ZoneType set, so a hand-authored code carrying enemy-threat
    // must survive a round-trip, not get dropped.
    const board = base({ zones: { '1,0': 'enemy-threat', '2,0': 'falling-rock' } });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zones).toEqual(board.zones);
  });

  it('round-trips authored zone entries without merging same-type or empty zones', () => {
    const board = base({
      zoneEntries: [
        { id: 'zone-1', type: 'pawn-promotion', tiles: ['0,0'] },
        { id: 'zone-2', type: 'pawn-promotion', tiles: ['1,0'] },
        { id: 'zone-3', type: 'objective', tiles: [] },
      ],
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual(board.zoneEntries);
    expect(decoded.zones).toEqual({ '0,0': 'pawn-promotion', '1,0': 'pawn-promotion' });
  });
});
