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

/**
 * The playable-board targeting rule. Doodads use it: they are tile-addressed board art and stay
 * inside the gameplay rectangle. Scene Art is exempt (free pixel placement). Props are NOT governed
 * by this — they follow the authored scenic surface, see `isPropFootprintOnAuthoredSurface`.
 */
export function canTargetPlacedArtCell(
  kind: PlacedArtBrushKind,
  x: number,
  y: number,
  cols: number,
  rows: number,
): boolean {
  return kind === 'artwork' || isPlayableBoardCoordinate(x, y, cols, rows);
}

/**
 * A prop sits ON GROUND, and the authored board's ground extends past the playable rectangle into
 * the scenic apron (ADR-0098/ADR-0365). Every footprint cell must therefore be an integer
 * coordinate of the authored surface — playable OR scenic — and an empty footprint is rejected.
 * The caller still applies its terrain-family gate per cell.
 *
 * The footprint must also be WHOLLY playable or WHOLLY scenic. A straddling prop has no coherent
 * gameplay meaning: `editorBoardToLevel` projects props by anchor, so an off-board anchor never
 * reaches `layers.props` and its overhanging playable cells would carry no collider — the editor
 * would refuse a unit there while the game walked straight through the tree. All-in-or-all-out
 * keeps the editor and in-game collision identical, and leaves the playable-only rule for a prop
 * anchored on the board exactly as it was.
 */
export function isPropFootprintOnAuthoredSurface(
  footprint: readonly PlacedArtCellCoordinate[],
  cols: number,
  rows: number,
  isAuthoredSurfaceCoordinate: (x: number, y: number) => boolean,
): boolean {
  if (footprint.length === 0) return false;
  if (!footprint.every(({ x, y }) =>
    Number.isInteger(x) && Number.isInteger(y) && isAuthoredSurfaceCoordinate(x, y))) return false;
  const playable = footprint.filter(({ x, y }) => isPlayableBoardCoordinate(x, y, cols, rows)).length;
  return playable === 0 || playable === footprint.length;
}
