import { BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM } from '@chess-tactics/board-render';

/** Defensive renderer floor; authored/default camera bounds own the actual level-specific floor. */
export const PLAYER_TECHNICAL_MINIMUM_ZOOM = BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM;
export const PLAYER_MAXIMUM_ZOOM = 1.45;

/**
 * How far in a player may always travel from whatever the level's own floor turns out to be.
 *
 * The absolute ceiling above was written for levels whose floor sits below 1. A level whose
 * environment art forces a HIGHER floor than that ceiling collapsed the whole range onto a single
 * zoom — the board could not be moved in or out at all, which reads as a cramped, locked camera.
 * Keeping a proportional headroom means every level offers the same travel the canonical
 * floor-of-one level always did, however its own floor lands.
 */
export const PLAYER_ZOOM_HEADROOM = PLAYER_MAXIMUM_ZOOM;

/**
 * The ceiling a player actually gets.
 *
 * Levels whose floor still sits under the absolute cap keep exactly the cap they have always had.
 * The proportional headroom engages only once the floor has climbed past it, which is precisely the
 * case the absolute cap cannot express: without this the ceiling collapses onto the floor and the
 * player is left with no zoom travel whatsoever.
 */
export function playerMaximumZoom(minZoom: number, ...atLeast: number[]): number {
  const headroom = minZoom >= PLAYER_MAXIMUM_ZOOM ? minZoom * PLAYER_ZOOM_HEADROOM : 0;
  return Math.max(PLAYER_MAXIMUM_ZOOM, headroom, minZoom, ...atLeast);
}
