import { describe, expect, it } from 'vitest';
import {
  BOARD_CAMERA_RESOLUTION_PRESETS,
  BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM,
  boardCameraBoundsAtSize,
  boardCameraBoundsPolygon,
  boardCameraResolution,
  centerBoardCameraBoundsOnBoard,
  centeredPlayableBoardFramingBounds,
  defaultBoardCameraBounds,
  effectiveBoardCameraCoverPolygon,
  largestBoxInsideBoardCameraPolygon,
  normalizeBoardCameraBounds,
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

  /** "Fit to artwork" is only useful if the rectangle it writes really is inside the paint. */
  describe('largest box inside the artwork', () => {
    it('returns a rectangular region unchanged', () => {
      expect(largestBoxInsideBoardCameraPolygon([
        { x: -744, y: -451 }, { x: 706, y: -451 }, { x: 706, y: 365 }, { x: -744, y: 365 },
      ])).toEqual({ minX: -744, minY: -451, width: 1450, height: 816 });
    });

    it('stays inside a warped quad on every corner', () => {
      // A legacy plate registered through a homography: no edge is axis aligned.
      const quad = [
        { x: -700, y: -400 }, { x: 720, y: -330 }, { x: 660, y: 380 }, { x: -640, y: 300 },
      ];
      const box = largestBoxInsideBoardCameraPolygon(quad);
      expect(box).toBeDefined();
      const corners = [
        { x: box!.minX, y: box!.minY },
        { x: box!.minX + box!.width, y: box!.minY },
        { x: box!.minX + box!.width, y: box!.minY + box!.height },
        { x: box!.minX, y: box!.minY + box!.height },
      ];
      const area = (a: typeof corners[0], b: typeof corners[0], c: typeof corners[0]) =>
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      for (const corner of corners) {
        const inside = quad.every((start, index) =>
          area(start, quad[(index + 1) % quad.length], corner) >= -1e-6);
        expect(inside).toBe(true);
      }
      // And it is a real fit rather than a token rectangle in the middle.
      expect(box!.width * box!.height).toBeGreaterThan(0.75 * 1420 * 700);
    });

    it('declines a degenerate region rather than inventing one', () => {
      expect(largestBoxInsideBoardCameraPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeUndefined();
      expect(largestBoxInsideBoardCameraPolygon([
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
      ])).toBeUndefined();
    });
  });

  it('always resolves a box, so every level has one to drag', () => {
    const board = { cols: 4, rows: 4 };
    const cover = effectiveBoardCameraCoverPolygon(board);
    expect(cover.length).toBe(4);
    expect(boardCameraBoundsPolygon(resolvedBoardCameraBounds(board))).toEqual(cover);
  });

  /**
   * The slack between the board and the box IS the scrolling room, so an off-centre box gives
   * one side more of it than the other.
   */
  describe('centring on the playable grid', () => {
    const board = { cols: 6, rows: 5 };
    const playable = centeredPlayableBoardFramingBounds(board, 0);
    const room = (box: ReturnType<typeof centerBoardCameraBoundsOnBoard>) => ({
      left: playable.minX - box.minX,
      right: (box.minX + box.width) - (playable.minX + playable.width),
      top: playable.minY - box.minY,
      bottom: (box.minY + box.height) - (playable.minY + playable.height),
    });

    it('evens the room on both sides of both axes without resizing', () => {
      const lopsided = { minX: -900, minY: -700, width: 1_600, height: 1_000 };
      const centered = centerBoardCameraBoundsOnBoard(lopsided, board);
      expect(centered.width).toBe(lopsided.width);
      expect(centered.height).toBe(lopsided.height);
      const slack = room(centered);
      expect(slack.left).toBeCloseTo(slack.right, 6);
      expect(slack.top).toBeCloseTo(slack.bottom, 6);
    });

    it('is already the answer for a box that is centred', () => {
      const snapped = defaultBoardCameraBounds(board);
      expect(centerBoardCameraBoundsOnBoard(snapped, board)).toEqual(snapped);
    });

    /**
     * The mandatory opening frame shares this centre, so an undersized box grows symmetrically
     * instead of being shoved back off the centre it was just given.
     */
    it('survives normalization still centred when the box is too small to be legal', () => {
      const tiny = centerBoardCameraBoundsOnBoard({ minX: 0, minY: 0, width: 40, height: 30 }, board);
      const normalized = normalizeBoardCameraBounds(tiny, board)!;
      const slack = room(normalized);
      expect(slack.left).toBeCloseTo(slack.right, 6);
      expect(slack.top).toBeCloseTo(slack.bottom, 6);
    });
  });

  /**
   * World pixels are screen pixels at zoom 1, so sizing the box to a display resolution states
   * exactly what a player on that display sees fully zoomed out, art drawn one-to-one.
   */
  describe('snapping to a display resolution', () => {
    it('takes the exact world-pixel size and keeps the centre it had', () => {
      const authored = { minX: -394, minY: -229, width: 788, height: 437 };
      const sized = boardCameraBoundsAtSize(authored, { width: 1_920, height: 1_080 });
      expect(sized.width).toBe(1_920);
      expect(sized.height).toBe(1_080);
      expect(sized.minX + sized.width / 2).toBeCloseTo(authored.minX + authored.width / 2, 6);
      expect(sized.minY + sized.height / 2).toBeCloseTo(authored.minY + authored.height / 2, 6);
    });

    it('offers real display sizes whose stated aspect is the one they have', () => {
      const ratios: Record<string, number> = { '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 64 / 27 };
      expect(BOARD_CAMERA_RESOLUTION_PRESETS.length).toBeGreaterThan(0);
      for (const preset of BOARD_CAMERA_RESOLUTION_PRESETS) {
        expect(preset.id).toBe(`${preset.width}x${preset.height}`);
        expect(boardCameraResolution(preset.id)).toBe(preset);
        // 21:9 is a marketing name for several near ratios; the rest are exact.
        expect(preset.width / preset.height).toBeCloseTo(ratios[preset.aspect], preset.aspect === '21:9' ? 0 : 6);
      }
    });

    it('has no resolution for an id it does not offer', () => {
      expect(boardCameraResolution('1920x1081')).toBeUndefined();
    });
  });
});
