import { describe, expect, it } from 'vitest';
import { BOARD_PREVIEW_ASPECT } from '@chess-tactics/board-render';
import {
  fixedDesignScale,
  PLAY_BOARD_VIEW_SIZE,
  PLAY_DESIGN_SIZE,
  PLAY_HEADER_HEIGHT,
  PLAY_HUD_WIDTH,
} from './fixedDesignCanvas';

describe('fixed Play design canvas', () => {
  it('declares one canonical 1920 by 1080 composition', () => {
    expect(PLAY_DESIGN_SIZE).toEqual({ width: 1920, height: 1080 });
    expect(PLAY_HEADER_HEIGHT).toBe(88);
    expect(PLAY_HUD_WIDTH).toBe(360);
    expect(PLAY_BOARD_VIEW_SIZE).toEqual({ width: 1560, height: 992 });
    expect(PLAY_BOARD_VIEW_SIZE.width / PLAY_BOARD_VIEW_SIZE.height).toBe(
      BOARD_PREVIEW_ASPECT.width / BOARD_PREVIEW_ASPECT.height,
    );
  });

  it('uniformly contains the composition without changing its internal geometry', () => {
    expect(fixedDesignScale({ width: 1920, height: 1080 })).toBe(1);
    expect(fixedDesignScale({ width: 1280, height: 720 })).toBeCloseTo(2 / 3);
    expect(fixedDesignScale({ width: 2048, height: 1050 })).toBeCloseTo(1050 / 1080);
    expect(fixedDesignScale({ width: 900, height: 1200 })).toBeCloseTo(900 / 1920);
  });
});
