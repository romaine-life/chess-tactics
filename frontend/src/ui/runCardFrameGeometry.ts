export const RUN_CARD_FRAME_NATIVE_WIDTH = 1060;
export const RUN_CARD_FRAME_NATIVE_HEIGHT = 1484;

export type RunCardFrameBoxName = 'title' | 'cost' | 'art' | 'type' | 'contents';

export const RUN_CARD_FRAME_BOX_NAMES: readonly RunCardFrameBoxName[] = Object.freeze([
  'title', 'cost', 'art', 'type', 'contents',
]);

export type RunCardFrameRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RunCardFrameGeometry = Readonly<{
  id: 'standard-v1' | 'concinnous-steel-v1';
  sourceWidth: typeof RUN_CARD_FRAME_NATIVE_WIDTH;
  sourceHeight: typeof RUN_CARD_FRAME_NATIVE_HEIGHT;
  frameSha256: string;
  boxes: Readonly<Record<RunCardFrameBoxName, RunCardFrameRect>>;
}>;

const SHA256 = /^[0-9a-f]{64}$/;

function defineGeometry(
  geometry: Omit<RunCardFrameGeometry, 'sourceWidth' | 'sourceHeight'>,
): RunCardFrameGeometry {
  if (!SHA256.test(geometry.frameSha256)) throw new Error(`${geometry.id} frame SHA-256 is invalid`);
  for (const [name, box] of Object.entries(geometry.boxes)) {
    if (
      !Number.isFinite(box.x) || !Number.isFinite(box.y)
      || !Number.isFinite(box.width) || !Number.isFinite(box.height)
      || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
      || box.x + box.width > RUN_CARD_FRAME_NATIVE_WIDTH
      || box.y + box.height > RUN_CARD_FRAME_NATIVE_HEIGHT
    ) throw new Error(`${geometry.id} ${name} box is outside the native frame`);
  }
  return Object.freeze({
    ...geometry,
    sourceWidth: RUN_CARD_FRAME_NATIVE_WIDTH,
    sourceHeight: RUN_CARD_FRAME_NATIVE_HEIGHT,
    boxes: Object.freeze(geometry.boxes),
  });
}

/**
 * The original Card Layout boxes expressed in their native 1060x1484 pixels.
 * The fractional values preserve the previously approved CSS percentages.
 */
export const RUN_CARD_STANDARD_FRAME_GEOMETRY = defineGeometry({
  id: 'standard-v1',
  frameSha256: '73710874141ec1c904416860d55a0be69d4dc7f5104db7eeecbfc756ca02dfe1',
  boxes: {
    title: { x: 98.58, y: 86.072, width: 725.04, height: 92.008 },
    // Centered on the drawn coin socket shared by the standard, pestiferous,
    // and tactical frames (measured seat center ~(932.5, 130.5)).
    cost: { x: 873.67, y: 77.18, width: 117.66, height: 106.848 },
    art: { x: 101.23, y: 210.728, width: 857.54, height: 598.052 },
    type: { x: 98.58, y: 863.688, width: 854.36, height: 69.006 },
    contents: { x: 102.82, y: 967.568, width: 854.36, height: 425.908 },
  },
});

/**
 * Measured safe boxes for the preferred generated forged-steel frame. Its
 * panels are lower than Standard, but the shared renderer still owns every
 * inset, font rule, density treatment, and optical tuning inside these boxes.
 */
export const RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY = defineGeometry({
  id: 'concinnous-steel-v1',
  frameSha256: '0069be656caaebd00c0dd47e7e7a21d5c4f8978d170ecea1cbd11647767e75f3',
  boxes: {
    title: { x: 98.58, y: 95, width: 725.04, height: 86 },
    cost: { x: 865.42, y: 82.076, width: 117.66, height: 106.848 },
    art: { x: 106, y: 219, width: 848, height: 637 },
    type: { x: 98.58, y: 896, width: 854.36, height: 72 },
    contents: { x: 102, y: 994, width: 856, height: 407 },
  },
});

export function runCardFrameGeometryForSha(frameSha256: string | null): RunCardFrameGeometry {
  return frameSha256 === RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY.frameSha256
    ? RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY
    : RUN_CARD_STANDARD_FRAME_GEOMETRY;
}

function percentage(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`;
}

/** Converts native frame-pixel boxes into the shared face's responsive CSS variables. */
export function runCardFrameGeometryVariables(
  geometry: RunCardFrameGeometry,
): Readonly<Record<string, string>> {
  return Object.fromEntries(RUN_CARD_FRAME_BOX_NAMES.flatMap((name) => {
    const box = geometry.boxes[name];
    return [
      [`--run-card-${name}-left`, percentage(box.x, geometry.sourceWidth)],
      [`--run-card-${name}-top`, percentage(box.y, geometry.sourceHeight)],
      [`--run-card-${name}-width`, percentage(box.width, geometry.sourceWidth)],
      [`--run-card-${name}-height`, percentage(box.height, geometry.sourceHeight)],
    ];
  }));
}
