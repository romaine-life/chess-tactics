import type { PlacedArtBrushKind } from './levelEditorRoute';

export type PlacedArtCellCoordinate = Readonly<{
  x: number;
  y: number;
}>;

export function isPlayableBoardCoordinate(
  x: number,
  y: number,
  cols: number,
  rows: number,
): boolean {
  return Number.isInteger(x)
    && Number.isInteger(y)
    && x >= 0
    && x < cols
    && y >= 0
    && y < rows;
}

export function canTargetPlacedArtCell(
  kind: PlacedArtBrushKind,
  x: number,
  y: number,
  cols: number,
  rows: number,
): boolean {
  // Scene Art and the Forest brush are gameplay-inert scenery placed in free scene pixels, so
  // they are never confined to the playable rectangle. Doodads and props are.
  return kind === 'artwork' || kind === 'forest' || isPlayableBoardCoordinate(x, y, cols, rows);
}

export function isPropFootprintWithinPlayableBoard(
  footprint: readonly PlacedArtCellCoordinate[],
  cols: number,
  rows: number,
): boolean {
  return footprint.length > 0
    && footprint.every(({ x, y }) => isPlayableBoardCoordinate(x, y, cols, rows));
}
