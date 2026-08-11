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

  const acceptedArt = [
    { x: -400, y: -400 },
    { x: 400, y: -400 },
    { x: 400, y: 400 },
    { x: -400, y: 400 },
  ];

  it('intersects an AUTHORED camera box with accepted pre-drawn pixels', () => {
    const cover = effectiveBoardCameraCoverPolygon(
      {
        cols: 8,
        rows: 8,
        cameraBounds: { minX: -500, minY: -300, width: 1_000, height: 600 },
      },
      acceptedArt,
    );
    expect(cover).toBeDefined();
    expect(Math.min(...cover!.map((point) => point.x))).toBe(-400);
    expect(Math.max(...cover!.map((point) => point.x))).toBe(400);
    expect(Math.min(...cover!.map((point) => point.y))).toBe(-300);
    expect(Math.max(...cover!.map((point) => point.y))).toBe(300);
  });

  /**
   * The snap default is an authoring convenience sized tightly around the playable surface,
   * and it is normally far smaller than what the level already paints. Enforcing it as the
   * runtime boundary adds no art — it only forces the camera in until a fully painted board
   * stops fitting on screen.
   */
  it('falls back to the accepted pixels, not the snap default, when no box is authored', () => {
    const board = { cols: 4, rows: 4 };
    const cover = effectiveBoardCameraCoverPolygon(board, acceptedArt);
    expect(cover).toEqual(acceptedArt);
    // Not merely different from the default — WIDER than it, which is the coverage the old
    // intersection threw away on every level that never opened the Camera page.
    const snapDefault = defaultBoardCameraBounds(board);
    expect(snapDefault.width).toBeLessThan(800);
    expect(snapDefault.height).toBeLessThan(800);
  });

  /**
   * A board with neither an authored box nor a finite painting has its backdrop locked to
   * the viewport: it paints wherever the camera goes, so there is no unpainted world to keep
   * a player out of. Handing back a boundary anyway costs zoom range to protect nothing.
   */
  it('states no boundary at all when coverage is unconditional', () => {
    expect(effectiveBoardCameraCoverPolygon({ cols: 8, rows: 8 })).toBeUndefined();
    expect(effectiveBoardCameraCoverPolygon({
      cols: 8,
      rows: 8,
      cameraBounds: { minX: -500, minY: -300, width: 1_000, height: 600 },
    })).toBeDefined();
  });
});
