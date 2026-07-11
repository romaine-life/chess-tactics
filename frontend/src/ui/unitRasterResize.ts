export type UnitRaster = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type UnitContainRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}

export function unitContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): UnitContainRect {
  const sw = positiveInteger(sourceWidth, 'source width');
  const sh = positiveInteger(sourceHeight, 'source height');
  const tw = positiveInteger(targetWidth, 'target width');
  const th = positiveInteger(targetHeight, 'target height');
  const scale = Math.min(tw / sw, th / sh);
  const width = Math.max(1, Math.min(tw, Math.round(sw * scale)));
  const height = Math.max(1, Math.min(th, Math.round(sh * scale)));
  return {
    x: Math.floor((tw - width) / 2),
    y: Math.floor((th - height) / 2),
    width,
    height,
  };
}

/** Smoothly reduces the source into a contained delivery canvas without alpha fringes. */
export function recaptureUnitRaster(source: UnitRaster, width: number, height: number): UnitRaster {
  const sourceWidth = positiveInteger(source.width, 'source width');
  const sourceHeight = positiveInteger(source.height, 'source height');
  const targetWidth = positiveInteger(width, 'target width');
  const targetHeight = positiveInteger(height, 'target height');
  if (source.data.length !== sourceWidth * sourceHeight * 4) throw new Error('source raster byte length is invalid');

  const fit = unitContainRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const sourceStepX = sourceWidth / fit.width;
  const sourceStepY = sourceHeight / fit.height;
  const sampleArea = sourceStepX * sourceStepY;

  for (let y = 0; y < fit.height; y += 1) {
    const sourceTop = y * sourceStepY;
    const sourceBottom = (y + 1) * sourceStepY;
    const firstSourceY = Math.floor(sourceTop);
    const lastSourceY = Math.min(sourceHeight - 1, Math.ceil(sourceBottom) - 1);
    for (let x = 0; x < fit.width; x += 1) {
      const sourceLeft = x * sourceStepX;
      const sourceRight = (x + 1) * sourceStepX;
      const firstSourceX = Math.floor(sourceLeft);
      const lastSourceX = Math.min(sourceWidth - 1, Math.ceil(sourceRight) - 1);
      let alphaSum = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;

      for (let sourceY = firstSourceY; sourceY <= lastSourceY; sourceY += 1) {
        const yWeight = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
        for (let sourceX = firstSourceX; sourceX <= lastSourceX; sourceX += 1) {
          const xWeight = Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX);
          const weight = xWeight * yWeight;
          const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
          const alpha = source.data[sourceOffset + 3] / 255;
          const alphaWeight = alpha * weight;
          alphaSum += alphaWeight;
          redSum += source.data[sourceOffset] * alphaWeight;
          greenSum += source.data[sourceOffset + 1] * alphaWeight;
          blueSum += source.data[sourceOffset + 2] * alphaWeight;
        }
      }

      const targetOffset = ((fit.y + y) * targetWidth + fit.x + x) * 4;
      if (alphaSum > 0) {
        data[targetOffset] = Math.round(redSum / alphaSum);
        data[targetOffset + 1] = Math.round(greenSum / alphaSum);
        data[targetOffset + 2] = Math.round(blueSum / alphaSum);
      }
      data[targetOffset + 3] = Math.round((alphaSum / sampleArea) * 255);
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}
