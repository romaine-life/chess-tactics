export interface SolidPixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HistogramBar {
  start: number;
  height: number;
}

/**
 * Find the maximum-area axis-aligned rectangle whose every pixel satisfies `isSolid`.
 *
 * Each image row extends a histogram of consecutive solid pixels. A monotone stack then
 * enumerates every maximal histogram rectangle in O(width × height), so callers never need
 * to fall back to a painted bounding box that can contain transparent corners.
 */
export function largestSolidRect(
  isSolid: (x: number, y: number) => boolean,
  width: number,
  height: number,
): SolidPixelRect | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return null;
  }

  const columnHeights = new Uint32Array(width);
  let best: SolidPixelRect | null = null;
  let bestArea = 0;
  let bestCenterDistance = Infinity;
  const imageCenterX = width / 2;
  const imageCenterY = height / 2;

  const consider = (start: number, end: number, barHeight: number, row: number): void => {
    if (barHeight <= 0 || end <= start) return;
    const rectWidth = end - start;
    const area = rectWidth * barHeight;
    const x = start;
    const y = row - barHeight + 1;
    const centerX = x + rectWidth / 2;
    const centerY = y + barHeight / 2;
    const centerDistance = (centerX - imageCenterX) ** 2 + (centerY - imageCenterY) ** 2;
    if (
      area > bestArea
      || (area === bestArea && centerDistance < bestCenterDistance)
      || (
        area === bestArea
        && centerDistance === bestCenterDistance
        && best !== null
        && rectWidth > best.w
      )
    ) {
      best = { x, y, w: rectWidth, h: barHeight };
      bestArea = area;
      bestCenterDistance = centerDistance;
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      columnHeights[x] = isSolid(x, y) ? columnHeights[x] + 1 : 0;
    }

    const stack: HistogramBar[] = [];
    for (let x = 0; x <= width; x += 1) {
      const currentHeight = x < width ? columnHeights[x] : 0;
      let start = x;
      while (stack.length && stack[stack.length - 1].height > currentHeight) {
        const bar = stack.pop()!;
        consider(bar.start, x, bar.height, y);
        start = bar.start;
      }
      if (
        currentHeight > 0
        && (!stack.length || stack[stack.length - 1].height < currentHeight)
      ) {
        stack.push({ start, height: currentHeight });
      }
    }
  }

  return best;
}
