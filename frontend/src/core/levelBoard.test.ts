import { describe, it, expect } from 'vitest';
import { editorBoardToLevel, levelToEditorBoard } from './levelBoard';
import type { EditorBoard } from '../ui/boardCode';
import type { TerrainCell } from './types';
import { roadEdgeKey } from './featureAutotile';

// A blank board (no painted cells) derives every cell to void — enough to exercise the
// save-time projection without depending on specific Studio tile / unit ids.
const emptyBoard = (cols: number, rows: number): EditorBoard => ({
  cols, rows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {},
});
const filledBoard = (cols: number, rows: number, tileId = 'grass-a'): EditorBoard => {
  const board = emptyBoard(cols, rows);
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) board.cells[`${x},${y}`] = tileId;
  return board;
};

describe('editorBoardToLevel — INV7 round-trip / data-loss guards', () => {
  it('carries non-expressible terrain (bridge) AND elevation through from the pre-save level', () => {
    // The editor can paint neither `bridge` (no tile family, no feature) nor elevation (no height
    // tool), so both must survive a republish of a legacy official rather than flatten.
    const previousTerrain: TerrainCell[] = [
      { x: 0, y: 0, terrain: 'bridge', elevation: 1 },
      { x: 1, y: 0, terrain: 'grass', elevation: 2 },
    ];
    const level = editorBoardToLevel(filledBoard(4, 4), { id: 'l1', name: 'T', previousTerrain });
    const at = (x: number, y: number) => level.layers.terrain.find((c) => c.x === x && c.y === y)!;

    expect(at(0, 0).terrain).toBe('bridge'); // no family, no feature -> preserved by the guard
    expect(at(0, 0).elevation).toBe(1); // elevation preserved
    expect(at(1, 0).elevation).toBe(2);
    expect(level.board.heightLevels).toBe(3); // follows max elevation, not hard-coded 1
  });

  it('projects a road feature overlay back to `road` terrain so the game sees it', () => {
    const board = filledBoard(4, 4);
    board.features['2,1'] = { kind: 'road', material: 'cobble' };
    const level = editorBoardToLevel(board, { id: 'l2', name: 'R' });
    expect(level.layers.terrain.find((c) => c.x === 2 && c.y === 1)!.terrain).toBe('road');
  });

  it('a painted fresh board with no previous terrain is flat grass (heightLevels 1) and stamps boardCode', () => {
    const level = editorBoardToLevel(filledBoard(4, 4), { id: 'l3', name: 'New' });
    expect(level.board.heightLevels).toBe(1);
    expect(level.layers.terrain.every((c) => c.terrain === 'grass' && c.elevation === 0)).toBe(true);
    expect(typeof level.boardCode).toBe('string');
  });

  it('projects an erased editor cell to void terrain and reopens it as a gap', () => {
    const board = filledBoard(4, 4);
    delete board.cells['2,1'];

    const level = editorBoardToLevel(board, { id: 'l9', name: 'Gap' });
    expect(level.layers.terrain.find((c) => c.x === 2 && c.y === 1)!.terrain).toBe('void');

    const reopened = levelToEditorBoard(level);
    expect(reopened.cells['2,1']).toBeUndefined();
    expect(reopened.cells['0,0']).toBeTruthy();
  });

  it('keeps boundary fence rails in layers and boardCode', () => {
    const board = filledBoard(4, 4);
    const north = roadEdgeKey(0, 0, 0, -1);
    const east = roadEdgeKey(3, 1, 4, 1);
    board.fences = { [north]: 'wood', [east]: 'stone' };

    const level = editorBoardToLevel(board, { id: 'l12', name: 'Boundary fences' });
    expect(level.layers.fences).toEqual([north, east]);
    expect(levelToEditorBoard(level).fences).toEqual(board.fences);
  });

  it('round-trips standalone authored fence posts only through boardCode', () => {
    const board = filledBoard(4, 4);
    board.fencePosts = { '0,0': 'wood', '2,2': 'stone', '4,4': 'wood' };

    const level = editorBoardToLevel(board, { id: 'l15', name: 'Fence posts' });
    expect(level.layers.fences).toEqual([]);
    expect(levelToEditorBoard(level).fencePosts).toEqual(board.fencePosts);
  });

  it('projects and saves only north/west perimeter walls', () => {
    const board = filledBoard(4, 4);
    const north = roadEdgeKey(0, 0, 0, -1);
    const west = roadEdgeKey(0, 2, -1, 2);
    const interior = roadEdgeKey(1, 1, 1, 2);
    board.walls = { [north]: 'stone', [west]: 'brick', [interior]: 'stone' };

    const level = editorBoardToLevel(board, { id: 'l14', name: 'Walls' });
    expect(level.layers.fences).toEqual([north, west]);
    const reopened = levelToEditorBoard(level);
    expect(reopened.walls).toEqual({ [north]: 'stone', [west]: 'brick' });
    expect(reopened.fences).toEqual({});
  });

  it('maps only the assigned player faction to player and leaves unassigned maps CPU-only', () => {
    const board = filledBoard(4, 4);
    board.playerFaction = 'white';
    board.units = {
      '0,0': { unitId: 'rook', direction: 'south', faction: 'white' },
      '1,0': { unitId: 'knight', direction: 'south', faction: 'black' },
    };
    const assigned = editorBoardToLevel(board, { id: 'l6', name: 'Faction' });
    expect(assigned.layers.units.find((unit) => unit.x === 0)?.side).toBe('player');
    expect(assigned.layers.units.find((unit) => unit.x === 0)?.palette).toBe('white');
    expect(assigned.layers.units.find((unit) => unit.x === 1)?.side).toBe('enemy');
    expect(assigned.layers.units.find((unit) => unit.x === 1)?.palette).toBe('black');

    const unassigned = editorBoardToLevel({ ...board, playerFaction: null }, { id: 'l7', name: 'Neutral' });
    expect(unassigned.layers.units.every((unit) => unit.side === 'enemy')).toBe(true);
  });
});

describe('levelToEditorBoard — legacy (no boardCode) derive path', () => {
  it('surfaces legacy `road` terrain as a road feature overlay, round-tripping through layers', () => {
    // Save a board with a road overlay, then drop boardCode to force the layers-derive path —
    // the road must come back as a feature, not vanish into grass (the reported bug).
    const board = filledBoard(4, 4);
    board.features['2,1'] = { kind: 'road', material: 'cobble' };
    const saved = editorBoardToLevel(board, { id: 'l4', name: 'Road' });
    const legacy = { ...saved, boardCode: undefined };

    const reopened = levelToEditorBoard(legacy);
    expect(reopened.features['2,1']).toEqual({ kind: 'road', material: 'cobble' });
  });

  it('re-seeds exact board dimensions from boardCode on reopen', () => {
    const level = editorBoardToLevel(emptyBoard(6, 5), { id: 'l5', name: 'Dims' });
    const reopened = levelToEditorBoard(level);
    expect(reopened.cols).toBe(6);
    expect(reopened.rows).toBe(5);
  });

  it('round-trips board-level faction default directions through boardCode', () => {
    const board = filledBoard(4, 4);
    board.factionDirections = { 'navy-blue': 'north-west', crimson: 'south-east' };
    const level = editorBoardToLevel(board, { id: 'l11', name: 'Directions' });
    expect(levelToEditorBoard(level).factionDirections).toEqual(board.factionDirections);
  });

  it('derives navy as the player faction for legacy player/enemy levels', () => {
    const saved = editorBoardToLevel(filledBoard(4, 4), { id: 'l8', name: 'Legacy' });
    const legacy = {
      ...saved,
      boardCode: undefined,
      layers: {
        ...saved.layers,
        units: [{ x: 0, y: 0, type: 'king' as const, side: 'player' as const }],
      },
    };
    expect(levelToEditorBoard(legacy).playerFaction).toBe('navy-blue');
  });

  it('derives legacy void terrain as an empty editor cell', () => {
    const saved = editorBoardToLevel(filledBoard(4, 4), { id: 'l10', name: 'Legacy Gap' });
    const legacy = {
      ...saved,
      boardCode: undefined,
      layers: {
        ...saved.layers,
        terrain: saved.layers.terrain.map((cell) => (cell.x === 1 && cell.y === 2 ? { ...cell, terrain: 'void' as const } : cell)),
      },
    };
    expect(levelToEditorBoard(legacy).cells['1,2']).toBeUndefined();
    expect(levelToEditorBoard(legacy).cells['0,0']).toBeTruthy();
  });

  it('re-seeds legacy boundary fence rails from layers', () => {
    const edge = roadEdgeKey(0, 0, -1, 0);
    const saved = editorBoardToLevel(filledBoard(4, 4), { id: 'l13', name: 'Legacy Fence' });
    const legacy = {
      ...saved,
      boardCode: undefined,
      layers: { ...saved.layers, fences: [edge] },
    };
    const reopened = levelToEditorBoard(legacy);
    expect(reopened.fences).toEqual({ [edge]: 'wood' });
    expect(reopened.fencePosts).toEqual({});
  });
});

describe('editorBoardToLevel — authored victory (ADR-0064)', () => {
  it('writes meta.victory onto the level, and omits it when absent (preset)', () => {
    const victory = [
      { if: [{ kind: 'eliminate' as const, side: 'player' as const }], do: [{ kind: 'lose' as const, side: 'player' as const }] },
      { if: [{ kind: 'reach' as const, side: 'player' as const }], do: [{ kind: 'win' as const, side: 'player' as const }] },
    ];
    const withVictory = editorBoardToLevel(filledBoard(4, 4), { id: 'lv1', name: 'V', victory });
    expect(withVictory.victory).toEqual(victory);

    const preset = editorBoardToLevel(filledBoard(4, 4), { id: 'lv2', name: 'P' });
    expect(preset.victory).toBeUndefined();
  });
});
