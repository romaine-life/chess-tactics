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
        { id: 'zone-1', name: 'North landing', color: 'blue', type: 'region', tiles: ['0,0'] },
        { id: 'zone-2', name: 'South landing', color: 'red', type: 'region', tiles: ['1,0'] },
        { id: 'zone-3', name: 'Empty label', color: 'gold', type: 'region', tiles: [] },
      ],
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual(board.zoneEntries);
    expect(decoded.zones).toEqual({ '0,0': 'region', '1,0': 'region' });
  });

  it('round-trips the dedicated zones and a Player Deployment zone that bars types', () => {
    const board = base({
      zoneEntries: [
        { id: 'zone-1', name: 'Player Deployment', color: 'blue', type: 'player-spawn', excludedPieceTypes: ['pawn', 'king'], tiles: ['0,0', '1,0'] },
        { id: 'zone-2', name: 'Pawn Deployment', color: 'violet', type: 'player-pawn-spawn', tiles: ['1,0', '2,0'] },
        { id: 'zone-3', name: 'King Deployment', color: 'gold', type: 'player-king-spawn', tiles: ['3,0'] },
      ],
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual(board.zoneEntries);
  });

  it('leaves a board code without a type bar byte-identical to one that never had the list', () => {
    const withFlag = base({ zoneEntries: [{ id: 'zone-1', type: 'player-spawn', excludedPieceTypes: [], tiles: ['0,0'] }] });
    const withoutFlag = base({ zoneEntries: [{ id: 'zone-1', type: 'player-spawn', tiles: ['0,0'] }] });
    expect(encodeBoard(withFlag)).toBe(encodeBoard(withoutFlag));
  });

  it('drops a type bar written on a zone type that cannot use one', () => {
    const board = base({ zoneEntries: [{ id: 'zone-1', type: 'player-pawn-spawn', excludedPieceTypes: ['pawn'], tiles: ['0,0'] }] });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual([{ id: 'zone-1', type: 'player-pawn-spawn', tiles: ['0,0'] }]);
  });

  it('folds duplicate deployment zones into one per type, keeping every painted square', () => {
    // A pasted or legacy code can carry two Enemy Deployment zones; only one object may survive,
    // and no square it painted may be lost (ADR-0365).
    const board = base({
      zoneEntries: [
        { id: 'zone-1', name: 'Enemy Deployment', type: 'enemy-spawn', tiles: ['0,0'] },
        { id: 'zone-2', name: 'Enemy Deployment 2', type: 'enemy-spawn', tiles: ['0,0', '1,0'] },
        { id: 'zone-3', name: 'A region', type: 'region', tiles: ['2,0'] },
        { id: 'zone-4', name: 'Another region', type: 'region', tiles: ['3,0'] },
      ],
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual([
      { id: 'zone-1', name: 'Enemy Deployment', type: 'enemy-spawn', tiles: ['0,0', '1,0'] },
      { id: 'zone-3', name: 'A region', type: 'region', tiles: ['2,0'] },
      { id: 'zone-4', name: 'Another region', type: 'region', tiles: ['3,0'] },
    ]);
  });

  it('reads the short-lived pawn-only spelling of the bar as a barred-type list', () => {
    // A board code minted while the element was the literal 1 must still open as a pawn bar.
    const legacy = { c: 6, r: 6, zn: [['zone-1', 'player-spawn', ['0,0'], '', '', 1]] };
    const code = Buffer.from(JSON.stringify(legacy), 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeBoard(code)!.zoneEntries).toEqual([
      { id: 'zone-1', type: 'player-spawn', excludedPieceTypes: ['pawn'], tiles: ['0,0'] },
    ]);
  });

  it('decodes legacy authored zone entries that do not carry names', () => {
    const board = base({
      zoneEntries: [
        { id: 'zone-1', type: 'pawn-promotion', tiles: ['0,0'] },
        { id: 'zone-2', type: 'pawn-promotion', tiles: ['1,0'] },
      ],
    });
    const decoded = decodeBoard(encodeBoard(board))!;
    expect(decoded.zoneEntries).toEqual(board.zoneEntries);
    expect(decoded.zones).toEqual({ '0,0': 'pawn-promotion', '1,0': 'pawn-promotion' });
  });
});
