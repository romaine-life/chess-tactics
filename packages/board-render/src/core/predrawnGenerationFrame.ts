/**
 * Owner-authored crop for the one canonical pre-drawn generation reference.
 *
 * Coordinates are canonical board-render pixels at native 1x. `x`/`y` name the
 * frame's top-left corner; width/height are also the exact CSS/PNG capture size.
 */
export interface PredrawnGenerationFrame {
  version: 1;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAX_PREDRAWN_GENERATION_FRAME_DIMENSION = 8192;

/** Strictly normalize the persisted frame shape; invalid values have no partial meaning. */
export function normalizePredrawnGenerationFrame(
  value: unknown,
): PredrawnGenerationFrame | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const version = record.version;
  const x = record.x;
  const y = record.y;
  const width = record.width;
  const height = record.height;
  if (
    version !== 1
    || !Number.isSafeInteger(x)
    || !Number.isSafeInteger(y)
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || (width as number) < 1
    || (height as number) < 1
    || (width as number) > MAX_PREDRAWN_GENERATION_FRAME_DIMENSION
    || (height as number) > MAX_PREDRAWN_GENERATION_FRAME_DIMENSION
    || (width as number) * 9 !== (height as number) * 16
    || !Number.isSafeInteger((x as number) + (width as number))
    || !Number.isSafeInteger((y as number) + (height as number))
  ) return undefined;
  return {
    version: 1,
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
  };
}
