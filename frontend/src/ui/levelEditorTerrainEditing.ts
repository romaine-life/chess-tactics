import { breakMacroTilesAtCell } from '../core/macroTiles';
import type { EditorBoard } from './boardCode';

type CellCoordinate = { x: number; y: number };

const parseCanonicalCellKey = (key: string): CellCoordinate | null => {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isInteger(x) || !Number.isInteger(y) || `${x},${y}` !== key) return null;
  return { x, y };
};

const isPlayableCell = (board: EditorBoard, { x, y }: CellCoordinate): boolean =>
  x >= 0 && y >= 0 && x < board.cols && y < board.rows;

const isScenicCell = (board: EditorBoard, coordinate: CellCoordinate): boolean => {
  if (isPlayableCell(board, coordinate)) return false;
  const apron = board.decorativeApron ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return coordinate.x >= -apron.left
    && coordinate.y >= -apron.top
    && coordinate.x < board.cols + apron.right
    && coordinate.y < board.rows + apron.bottom;
};

/**
 * Paint one exact terrain tile id across selected playable and scenic coordinates.
 *
 * Playable cells reveal their ordinary tile top through any overlapping macrotile.
 * Scenic cells stay in the render-only decorative channel. Invalid and out-of-rectangle
 * coordinate keys are ignored. The source board and all of its nested content remain untouched.
 */
export function paintTerrainArea(
  board: EditorBoard,
  selectedCellKeys: Iterable<string>,
  tileId: string,
): EditorBoard {
  const next = structuredClone(board) as EditorBoard;

  for (const key of selectedCellKeys) {
    const coordinate = parseCanonicalCellKey(key);
    if (!coordinate) continue;
    if (isPlayableCell(board, coordinate)) {
      next.macroTiles = breakMacroTilesAtCell(next.macroTiles, coordinate.x, coordinate.y);
      next.cells[key] = tileId;
      continue;
    }
    if (!isScenicCell(board, coordinate)) continue;
    next.decorativeCells ??= {};
    next.decorativeCells[key] = tileId;
  }

  return next;
}
