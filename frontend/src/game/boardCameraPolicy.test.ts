import { describe, expect, it } from 'vitest';
import {
  BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM,
  boardCameraBoundsPolygon,
  defaultBoardCameraBounds,
  effectiveBoardCameraCoverPolygon,
  resolvedBoardCameraBounds,
} from '@chess-tactics/board-render';
import { minimumZoomToCoverViewport } from '../ui/shared/ViewPane';

describe('level camera policy', () => {
  it('derives different zoom-out floors from differently sized levels', () => {
    const viewport = { width: 800, height: 600 };
    const floor = (cols: number, rows: number): number => minimumZoomToCoverViewport({
      viewport,
      polygon: boardCameraBoundsPolygon(defaultBoardCameraBounds({ cols, rows })),
      minZoom: BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM,
      maxZoom: 16,
    });
    expect(floor(4, 4)).toBeGreaterThan(floor(12, 8));
  });

  it('offers balanced, proportional, and fixed snaps from playable geometry', () => {
    const board = { cols: 4, rows: 4 };
    const balanced = defaultBoardCameraBounds(board, 'balanced');
    const proportional = defaultBoardCameraBounds(board, 'proportional');
    const fixed = defaultBoardCameraBounds(board, 'fixed');
    expect(balanced.width).toBeGreaterThan(proportional.width);
    expect(balanced.height).toBeGreaterThan(proportional.height);
    expect(balanced).toEqual(fixed);
    expect(resolvedBoardCameraBounds(board)).toEqual(balanced);
  });

  /**
   * The box is the whole authority. Nothing intersects it, nothing stands in for it, and it
   * does not depend on whether an author has touched it — a camera limit that changes rule
   * per level cannot be read off the screen, which is what made a zoom control unusable.
   */
  it('is the level box, exactly, with nothing else consulted', () => {
    const authored = { minX: -500, minY: -300, width: 1_000, height: 600 };
    const cover = effectiveBoardCameraCoverPolygon({ cols: 8, rows: 8, cameraBounds: authored });
    expect(Math.min(...cover.map((point) => point.x))).toBe(-500);
    expect(Math.max(...cover.map((point) => point.x))).toBe(500);
    expect(Math.min(...cover.map((point) => point.y))).toBe(-300);
    expect(Math.max(...cover.map((point) => point.y))).toBe(300);
  });

  it('always resolves a box, so every level has one to drag', () => {
    const board = { cols: 4, rows: 4 };
    const cover = effectiveBoardCameraCoverPolygon(board);
    expect(cover.length).toBe(4);
    expect(boardCameraBoundsPolygon(resolvedBoardCameraBounds(board))).toEqual(cover);
  });
});
