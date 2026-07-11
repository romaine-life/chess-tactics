import { describe, expect, it } from 'vitest';
import { recaptureUnitRaster, unitContainRect, type UnitRaster } from './unitRasterResize';

const indexedRaster = (width: number, height: number): UnitRaster => ({
  width,
  height,
  data: new Uint8ClampedArray(Array.from({ length: width * height }, (_, index) => [index, 0, 0, 255]).flat()),
});

const redValues = (raster: UnitRaster): number[] => Array.from(
  raster.data.filter((_, index) => index % 4 === 0),
);

const alphaValues = (raster: UnitRaster): number[] => Array.from(
  raster.data.filter((_, index) => index % 4 === 3),
);

describe('recaptureUnitRaster', () => {
  it('preserves the source aspect ratio inside the delivery canvas', () => {
    expect(unitContainRect(512, 512, 51, 61)).toEqual({ x: 0, y: 5, width: 51, height: 51 });
  });

  it('area-averages into the contained rectangle without changing the source', () => {
    const source = indexedRaster(4, 4);
    const before = new Uint8ClampedArray(source.data);
    const result = recaptureUnitRaster(source, 2, 4);

    expect(result.width).toBe(2);
    expect(result.height).toBe(4);
    expect(redValues(result)).toEqual([0, 0, 3, 5, 11, 13, 0, 0]);
    expect(alphaValues(result)).toEqual([0, 0, 255, 255, 255, 255, 0, 0]);
    expect(source.data).toEqual(before);
  });

  it('averages in premultiplied alpha so transparent colors cannot create fringes', () => {
    const source: UnitRaster = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 0, 255, 0,
      ]),
    };

    expect(Array.from(recaptureUnitRaster(source, 1, 1).data)).toEqual([255, 0, 0, 128]);
  });

  it('keeps RGBA values exact when the dimensions already match', () => {
    const source = indexedRaster(3, 2);
    const result = recaptureUnitRaster(source, 3, 2);

    expect(result.data).toEqual(source.data);
    expect(result.data).not.toBe(source.data);
  });

  it('rejects malformed raster contracts', () => {
    expect(() => recaptureUnitRaster({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, 1, 1))
      .toThrow('source raster byte length is invalid');
    expect(() => recaptureUnitRaster(indexedRaster(2, 2), 0, 1)).toThrow('target width must be a positive integer');
  });
});
