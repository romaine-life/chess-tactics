import { describe, expect, it } from 'vitest';
import type { BoardDrawOp } from '@chess-tactics/board-render';
import { drawOpPaintsPoint, sourcePointForDrawOp, type RasterAlphaMask } from './rasterAlpha';

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
