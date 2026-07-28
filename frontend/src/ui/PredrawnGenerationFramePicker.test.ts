import { describe, expect, it } from 'vitest';
import type { PredrawnGenerationFrame } from '@chess-tactics/board-render';
import { resizePredrawnGenerationFrame } from './PredrawnGenerationFramePicker';

const openingFrame: PredrawnGenerationFrame = {
  version: 1,
  x: 100,
  y: -50,
  width: 1600,
  height: 900,
};

function frameCenter(frame: PredrawnGenerationFrame): { x: number; y: number } {
  return {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  };
}

describe('pre-drawn generation frame resizing', () => {
  it('changes scene scale around the selected frame center without changing 16:9', () => {
    const resized = resizePredrawnGenerationFrame(openingFrame, 1280);

    expect(resized).toEqual({
      version: 1,
      x: 260,
      y: 40,
      width: 1280,
      height: 720,
    });
    expect(frameCenter(resized)).toEqual(frameCenter(openingFrame));
    expect(resized.width * 9).toBe(resized.height * 16);
  });

  it('quantizes arbitrary zoom input to native-pixel dimensions that remain exactly 16:9', () => {
    const resized = resizePredrawnGenerationFrame(openingFrame, 1271);

    expect(resized.width).toBe(1264);
    expect(resized.height).toBe(711);
    expect(Number.isInteger(resized.x)).toBe(true);
    expect(Number.isInteger(resized.y)).toBe(true);
    expect(resized.width % 16).toBe(0);
    expect(resized.width * 9).toBe(resized.height * 16);
    expect(Math.abs(frameCenter(resized).x - frameCenter(openingFrame).x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(frameCenter(resized).y - frameCenter(openingFrame).y)).toBeLessThanOrEqual(0.5);
  });

  it('keeps owner zoom controls inside the persisted frame bounds', () => {
    const tightest = resizePredrawnGenerationFrame(openingFrame, 1);
    const widest = resizePredrawnGenerationFrame(openingFrame, 100_000);

    expect(tightest.width).toBe(320);
    expect(tightest.height).toBe(180);
    expect(widest.width).toBe(8192);
    expect(widest.height).toBe(4608);
    expect(frameCenter(tightest)).toEqual(frameCenter(openingFrame));
    expect(frameCenter(widest)).toEqual(frameCenter(openingFrame));
  });
});
