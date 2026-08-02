import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { backdropCutReport, cardFrameBackdropMask } from './cut-card-frame-backdrop.mjs';

// A miniature of the delivered frames: a flat dark backdrop, the frame body,
// the black outline it draws against that backdrop, and a dark interior the cut
// must never reach.
function frameFixture({ backdrop = 21, gapAt = null } = {}) {
  const width = 200;
  const height = 280;
  const png = new PNG({ width, height });
  const paint = (x, y, value) => {
    const index = (y * width + x) * 4;
    png.data[index] = value;
    png.data[index + 1] = value;
    png.data[index + 2] = value;
    png.data[index + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) paint(x, y, backdrop);
  const left = 20, right = width - 21, top = 30, bottom = height - 31;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const border = x < left + 12 || x > right - 12 || y < top + 12 || y > bottom - 12;
      const outline = x === left || x === right || y === top || y === bottom;
      paint(x, y, outline ? 0 : border ? 150 : 8);
    }
  }
  // Optional break in the outer ring — a real frame's ornament can leave one.
  if (gapAt !== null) for (let y = gapAt; y < gapAt + 6; y += 1) for (let x = left; x < left + 12; x += 1) paint(x, y, 0);
  return png;
}

describe('card frame backdrop cut', () => {
  it('cuts the flat backdrop and keeps the frame body, its outline, and its interior', () => {
    const png = frameFixture();
    const mask = cardFrameBackdropMask(png);
    const at = (x, y) => mask[y * png.width + x];

    expect(at(0, 0)).toBe(1);
    expect(at(10, 140)).toBe(1);
    expect(at(18, 140)).toBe(1);
    expect(at(20, 140)).toBe(0); // the frame's black outline stays
    expect(at(26, 140)).toBe(0); // body
    expect(at(100, 140)).toBe(0); // dark interior

    const report = backdropCutReport(png, mask);
    expect(report.interior).toBe(0);
    expect(report.kept).toMatchObject({ minX: 19, minY: 29, maxX: 180, maxY: 250 });
    expect(report.share).toBeGreaterThan(.2);
    expect(report.share).toBeLessThan(.5);
  });

  it('keeps a pure black backdrop and a lighter one from reaching the interior', () => {
    for (const backdrop of [0, 34]) {
      const report = backdropCutReport(frameFixture({ backdrop }), cardFrameBackdropMask(frameFixture({ backdrop })));
      expect(report.interior, `backdrop ${backdrop}`).toBe(0);
      expect(report.kept.minX, `backdrop ${backdrop}`).toBe(19);
    }
  });

  it('reports a gap that drains the interior instead of writing a holed frame', () => {
    const png = frameFixture({ gapAt: 140 });
    const report = backdropCutReport(png, cardFrameBackdropMask(png));
    expect(report.interior).toBeGreaterThan(0);
  });
});
