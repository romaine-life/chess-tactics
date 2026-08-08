import { describe, expect, it } from 'vitest';
import type { BoardDrawOp } from '@chess-tactics/board-render';
import {
  drawOpPaintsPoint,
  drawOpPaintsWithinRect,
  rasterAlphaOccupancy,
  sourcePointForDrawOp,
  type RasterAlphaMask,
} from './rasterAlpha';

function mask(width: number, height: number, opaque: readonly [number, number][]): RasterAlphaMask {
  const rgba = new Uint8Array(width * height * 4);
  for (const [x, y] of opaque) rgba[(y * width + x) * 4 + 3] = 255;
  return { rgba, width, height };
}

describe('shared raster alpha sampling', () => {
  it('maps cropped draw operations back to the exact source pixels', () => {
    const op: BoardDrawOp = {
      src: 'tree.png',
      dx: 10,
      dy: 20,
      dw: 20,
      dh: 10,
      z: 1,
      sx: 2,
      sy: 1,
      sw: 4,
      sh: 2,
    };
    expect(sourcePointForDrawOp(op, { width: 8, height: 4 }, { x: 15, y: 25 })).toEqual({ x: 3, y: 2 });
    expect(drawOpPaintsPoint(op, mask(8, 4, [[3, 2]]), { x: 15, y: 25 })).toBe(true);
    expect(drawOpPaintsPoint(op, mask(8, 4, []), { x: 15, y: 25 })).toBe(false);
  });

  it('keeps transparent contain-box gutters inert', () => {
    const op: BoardDrawOp = { src: 'unit.png', dx: 0, dy: 0, dw: 20, dh: 20, z: 1, contain: true };
    const source = mask(4, 2, [[0, 0]]);
    expect(sourcePointForDrawOp(op, source, { x: 1, y: 1 })).toBeNull();
    expect(drawOpPaintsPoint(op, source, { x: 1, y: 1 })).toBe(false);
    expect(drawOpPaintsPoint(op, source, { x: 1, y: 6 })).toBe(true);
  });
});

describe('rectangle coverage', () => {
  // Opaque only in the right half; the left half is the sprite's transparent margin.
  const halfPainted = (): RasterAlphaMask => mask(8, 8, Array.from(
    { length: 8 * 4 },
    (_, index): [number, number] => [4 + (index % 4), Math.floor(index / 4)],
  ));

  it('reduces a source to a bounded opaque/empty grid', () => {
    const occupancy = rasterAlphaOccupancy(halfPainted(), 4);
    expect([occupancy.cols, occupancy.rows]).toEqual([4, 4]);
    expect([...occupancy.cells]).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]);
    // Sources larger than the cap never grow past it, however big the image.
    expect(rasterAlphaOccupancy(mask(2000, 2000, []), 48).cols).toBe(48);
  });

  it('takes a rectangle that covers painted pixels and refuses one that only clips the margin', () => {
    const op: BoardDrawOp = { src: 'tree.png', dx: 0, dy: 0, dw: 80, dh: 80, z: 1 };
    const source = halfPainted();
    expect(drawOpPaintsWithinRect(op, source, { minX: 45, minY: 10, maxX: 70, maxY: 70 })).toBe(true);
    // Wholly inside the image rectangle, wholly inside its transparent half.
    expect(drawOpPaintsWithinRect(op, source, { minX: 2, minY: 10, maxX: 30, maxY: 70 })).toBe(false);
    // Nowhere near it at all.
    expect(drawOpPaintsWithinRect(op, source, { minX: 200, minY: 200, maxX: 300, maxY: 300 })).toBe(false);
  });

  it('reads a mirrored draw op through the same flip its pixels are drawn with', () => {
    const source = halfPainted();
    const flipped: BoardDrawOp = { src: 'tree.png', dx: 0, dy: 0, dw: 80, dh: 80, z: 1, flipX: true };
    // Flipping puts the painted half on the LEFT of the destination.
    expect(drawOpPaintsWithinRect(flipped, source, { minX: 2, minY: 10, maxX: 30, maxY: 70 })).toBe(true);
    expect(drawOpPaintsWithinRect(flipped, source, { minX: 45, minY: 10, maxX: 70, maxY: 70 })).toBe(false);
  });

  it('accepts a degenerate rectangle so a hairline drag still answers', () => {
    const op: BoardDrawOp = { src: 'tree.png', dx: 0, dy: 0, dw: 80, dh: 80, z: 1 };
    expect(drawOpPaintsWithinRect(op, halfPainted(), { minX: 60, minY: 40, maxX: 60, maxY: 40 })).toBe(true);
  });
});
