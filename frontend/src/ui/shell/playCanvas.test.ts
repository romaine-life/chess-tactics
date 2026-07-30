import { describe, expect, it } from 'vitest';
import {
  PLAY_HEADER_HEIGHT,
  PLAY_HUD_WIDTH,
  PLAY_MAX_DESIGN_WIDTH,
  PLAY_MAX_VIEWPORT_ASPECT,
  PLAY_REFERENCE_BOARD_VIEW_SIZE,
  PLAY_REFERENCE_DESIGN_SIZE,
  PLAY_REFERENCE_STAGE_SIZE,
  playCanvasLayout,
} from './playCanvas';

describe('bounded-fluid Play canvas', () => {
  it('retains the authored reference composition', () => {
    expect(PLAY_REFERENCE_DESIGN_SIZE).toEqual({ width: 1920, height: 1080 });
    expect(PLAY_HEADER_HEIGHT).toBe(88);
    expect(PLAY_HUD_WIDTH).toBe(360);
    expect(PLAY_REFERENCE_STAGE_SIZE).toEqual({ width: 1920, height: 992 });
    expect(PLAY_REFERENCE_BOARD_VIEW_SIZE).toEqual({ width: 1560, height: 992 });
    expect(PLAY_MAX_VIEWPORT_ASPECT).toBe(2.1);
    expect(PLAY_MAX_DESIGN_WIDTH).toBe(2268);
  });

  it('expands to fill the owner usual browser viewport without wings', () => {
    const layout = playCanvasLayout({ width: 2560, height: 1310 });

    expect(layout.scale).toBeCloseTo((1310 - PLAY_HEADER_HEIGHT) / PLAY_REFERENCE_STAGE_SIZE.height);
    expect(layout.designSize.width).toBeCloseTo(2560 / layout.scale);
    expect(layout.designSize.height).toBe(992);
    expect(layout.designSize.width - PLAY_HUD_WIDTH).toBeGreaterThan(
      PLAY_REFERENCE_BOARD_VIEW_SIZE.width,
    );
    expect(layout.wingWidth).toBeCloseTo(0);
  });

  it('caps true ultrawide viewports and gives their surplus to centered wings', () => {
    const layout = playCanvasLayout({ width: 3440, height: 1310 });

    expect(layout.scale).toBeCloseTo((1310 - PLAY_HEADER_HEIGHT) / PLAY_REFERENCE_STAGE_SIZE.height);
    expect(layout.designSize.width).toBe(PLAY_MAX_DESIGN_WIDTH);
    expect(layout.wingWidth).toBeGreaterThan(300);
    expect(layout.designSize.width * layout.scale + 2 * layout.wingWidth).toBeCloseTo(3440);
  });

  it('keeps the same bounded composition on a 32:9 viewport', () => {
    const layout = playCanvasLayout({ width: 5120, height: 1440 });

    expect(layout.designSize.width).toBe(PLAY_MAX_DESIGN_WIDTH);
    expect(layout.scale).toBeCloseTo((1440 - PLAY_HEADER_HEIGHT) / PLAY_REFERENCE_STAGE_SIZE.height);
    expect(layout.wingWidth).toBeGreaterThan(1000);
  });

  it('preserves contain scaling below the reference aspect', () => {
    const layout = playCanvasLayout({ width: 900, height: 1200 });

    expect(layout.scale).toBeCloseTo(900 / 1920);
    expect(layout.designSize).toEqual(PLAY_REFERENCE_STAGE_SIZE);
    expect(layout.wingWidth).toBe(0);
  });

  it('uses the measured persistent title-bar height without scaling it', () => {
    const layout = playCanvasLayout({ width: 1280, height: 800 }, 84);

    expect(layout.scale).toBeCloseTo(1280 / PLAY_REFERENCE_STAGE_SIZE.width);
    expect(layout.designSize.height).toBe(PLAY_REFERENCE_STAGE_SIZE.height);
    expect(layout.designSize.height * layout.scale).toBeLessThanOrEqual(800 - 84);
  });
});
