import { BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM } from '@chess-tactics/board-render';

/** Defensive renderer floor; the zoom ladder owns the actual level-specific floor. */
export const PLAYER_TECHNICAL_MINIMUM_ZOOM = BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM;

/**
 * Initial ceiling before a pane has measured itself. Not a policy limit — the
 * ladder replaces it as soon as a viewport exists.
 */
export const PLAYER_MAXIMUM_ZOOM = Number.POSITIVE_INFINITY;

/**
 * How far in a player may zoom.
 *
 * There used to be an absolute cap here, plus proportional headroom to rescue the
 * levels whose floor had climbed past it. Both existed to survive a floor derived
 * continuously from geometry: it could land anywhere, including on top of the
 * ceiling, and collapse the range onto a single zoom.
 *
 * The floor is now a rung on the global ladder and the ceiling is the ladder's
 * closest tier — about two board cells filling the frame, past which zooming in
 * tells you nothing. Neither can collapse onto the other, so there is nothing left
 * to rescue and no cap to impose. A level that genuinely wants a tighter limit
 * still states one, and that is the only thing that narrows it.
 *
 * `atLeast` keeps a ceiling from landing under a zoom the camera already holds —
 * an authored opening composition is allowed to be closer than the authored limit.
 */
export function playerMaximumZoom(
  minZoom: number,
  authoredZoomIn: number | null | undefined,
  ...atLeast: number[]
): number {
  if (authoredZoomIn && authoredZoomIn > 0) return Math.max(authoredZoomIn, minZoom, ...atLeast);
  // Uncapped: the ladder's closest tier is the real ceiling and it is measured
  // where the viewport is known, so this must not narrow it.
  return Number.POSITIVE_INFINITY;
}
