import { describe, it, expect } from 'vitest';
import { editorBoardToLevel, levelToEditorBoard } from './levelBoard';
import type { EditorBoard } from '../ui/boardCode';
import type { TerrainCell } from './types';

// A blank board (no painted cells) derives every cell to grass — enough to exercise the
// save-time projection without depending on specific Studio tile / unit ids.
const emptyBoard = (cols: number, rows: number): EditorBoard => ({
  cols, rows, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {},
});

describe('editorBoardToLevel — INV7 round-trip / data-loss guards', () => {
  it('carries non-editor-expressible terrain AND elevation through from the pre-save level', () => {
    // The editor can paint neither `road` (no tile family) nor elevation (no height tool),
    // so both must survive a republish of a legacy official rather than flatten for players.
    const previousTerrain: TerrainCell[] = [
      { x: 0, y: 0, terrain: 'road', elevation: 1 },
      { x: 1, y: 0, terrain: 'grass', elevation: 2 },
    ];
    const level = editorBoardToLevel(emptyBoard(4, 4), { id: 'l1', name: 'T', previousTerrain });
    const at = (x: number, y: number) => level.layers.terrain.find((c) => c.x === x && c.y === y)!;

    expect(at(0, 0).terrain).toBe('road'); // would derive to grass; guard keeps it road
    expect(at(0, 0).elevation).toBe(1); // elevation preserved
    expect(at(1, 0).elevation).toBe(2);
    expect(level.board.heightLevels).toBe(3); // follows max elevation, not hard-coded 1
  });

  it('a fresh board with no previous terrain is flat grass (heightLevels 1) and stamps boardCode', () => {
    const level = editorBoardToLevel(emptyBoard(4, 4), { id: 'l2', name: 'New' });
    expect(level.board.heightLevels).toBe(1);
    expect(level.layers.terrain.every((c) => c.terrain === 'grass' && c.elevation === 0)).toBe(true);
    expect(typeof level.boardCode).toBe('string');
  });

  it('boardCode re-seeds the exact board dimensions on reopen', () => {
    const level = editorBoardToLevel(emptyBoard(6, 5), { id: 'l3', name: 'Dims' });
    const board = levelToEditorBoard(level);
    expect(board.cols).toBe(6);
    expect(board.rows).toBe(5);
  });
});
