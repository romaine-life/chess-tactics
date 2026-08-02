export const RUN_CARD_FRAME_NATIVE_WIDTH = 1060;
export const RUN_CARD_FRAME_NATIVE_HEIGHT = 1484;

export const RUN_CARD_FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
export const RUN_CARD_PESTIFEROUS_FRAME_SLOT = 'ui/run/card-prototypes/pestiferous-frame-v1.png';
export const RUN_CARD_CONCINNOUS_FRAME_SLOT = 'ui/run/card-prototypes/concinnous-frame-v1.png';
export const RUN_CARD_TACTICAL_FRAME_SLOT = 'ui/run/card-prototypes/tactical-discipline-frame-v1.png';
export const RUN_CARD_HIERATIC_FRAME_SLOT = 'ui/run/card-prototypes/hieratic-frame-v1.png';

export type RunCardFrameVariant = 'standard' | 'pestiferous' | 'concinnous' | 'tactical' | 'hieratic';

export const RUN_CARD_FRAME_VARIANTS: readonly RunCardFrameVariant[] = Object.freeze([
  'standard', 'pestiferous', 'concinnous', 'tactical', 'hieratic',
]);

export const RUN_CARD_FRAME_SLOT_BY_VARIANT: Readonly<Record<RunCardFrameVariant, string>> = Object.freeze({
  standard: RUN_CARD_FRAME_SLOT,
  pestiferous: RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  concinnous: RUN_CARD_CONCINNOUS_FRAME_SLOT,
  tactical: RUN_CARD_TACTICAL_FRAME_SLOT,
  hieratic: RUN_CARD_HIERATIC_FRAME_SLOT,
});

export type RunCardFrameBoxName = 'title' | 'cost' | 'art' | 'type' | 'contents';

export const RUN_CARD_FRAME_BOX_NAMES: readonly RunCardFrameBoxName[] = Object.freeze([
  'title', 'cost', 'art', 'type', 'contents',
]);

/**
 * How the tuning overlay draws the boxes. Aligning a box to a plate edge painted
 * in the frame means seeing that edge, so the lines can thin to a dotted hint or
 * disappear entirely while the sliders keep moving the box underneath.
 */
export type RunCardFrameBoxStyle = 'off' | 'dotted' | 'solid';

export const RUN_CARD_FRAME_BOX_STYLES: readonly RunCardFrameBoxStyle[] = Object.freeze([
  'off', 'dotted', 'solid',
]);

export const RUN_CARD_FRAME_BOX_LABELS: Readonly<Record<RunCardFrameBoxName, string>> = Object.freeze({
  title: 'Title',
  cost: 'Coin',
  art: 'Art',
  type: 'Type',
  contents: 'Contents',
});

export type RunCardFrameRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RunCardFrameBoxes = Readonly<Record<RunCardFrameBoxName, RunCardFrameRect>>;

export type RunCardFrameGeometry = Readonly<{
  id: `${RunCardFrameVariant}-v1`;
  variant: RunCardFrameVariant;
  slot: string;
  sourceWidth: typeof RUN_CARD_FRAME_NATIVE_WIDTH;
  sourceHeight: typeof RUN_CARD_FRAME_NATIVE_HEIGHT;
  /**
   * The exact frame pixels these boxes were tuned against, or null while the
   * boxes are only inherited seeds. A live frame whose SHA-256 differs from a
   * recorded one is showing text inside boxes measured on other pixels.
   */
  measuredSha256: string | null;
  boxes: RunCardFrameBoxes;
}>;

/**
 * The whole text-placement rule, shared by every frame and every card.
 *
 * Vertical: a box's text is centered in the box. No card, frame, or type line
 * carries its own vertical offset — a line that sits wrong means its box is
 * wrong, and the box is what gets tuned (ADR-0346).
 *
 * Horizontal: title and type text is inset from both plate edges by one shared
 * value; the cost reading is centered in its coin box. `opticalBlock` is the
 * single display-face correction available when centered caps read high or low,
 * and it applies to every box on every frame at once.
 */
export type RunCardTextPlacement = Readonly<{
  insetInline: number;
  opticalBlock: number;
}>;

export const RUN_CARD_TEXT_PLACEMENT: RunCardTextPlacement = Object.freeze({
  insetInline: 1.35,
  opticalBlock: 0,
});

const SHA256 = /^[0-9a-f]{64}$/;

function defineGeometry(
  geometry: Omit<RunCardFrameGeometry, 'id' | 'slot' | 'sourceWidth' | 'sourceHeight'>,
): RunCardFrameGeometry {
  if (geometry.measuredSha256 !== null && !SHA256.test(geometry.measuredSha256)) {
    throw new Error(`${geometry.variant} frame SHA-256 is invalid`);
  }
  for (const [name, box] of Object.entries(geometry.boxes)) {
    if (
      !Number.isFinite(box.x) || !Number.isFinite(box.y)
      || !Number.isFinite(box.width) || !Number.isFinite(box.height)
      || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0
      || box.x + box.width > RUN_CARD_FRAME_NATIVE_WIDTH
      || box.y + box.height > RUN_CARD_FRAME_NATIVE_HEIGHT
    ) throw new Error(`${geometry.variant} ${name} box is outside the native frame`);
  }
  return Object.freeze({
    ...geometry,
    id: `${geometry.variant}-v1`,
    slot: RUN_CARD_FRAME_SLOT_BY_VARIANT[geometry.variant],
    sourceWidth: RUN_CARD_FRAME_NATIVE_WIDTH,
    sourceHeight: RUN_CARD_FRAME_NATIVE_HEIGHT,
    // Declared in one order regardless of how a frame's literal groups its boxes,
    // so every geometry enumerates identically.
    boxes: Object.freeze(Object.fromEntries(
      RUN_CARD_FRAME_BOX_NAMES.map((name) => [name, geometry.boxes[name]]),
    ) as RunCardFrameBoxes),
  });
}

/**
 * The illustration window and contents panel each frame shared before the boxes
 * were separable. Both are carried forward untouched: the reviewed Contents Box
 * density ladder (ADR-0270) was tuned against these exact numbers, and neither
 * box was among the drifting text the by-eye pass addressed.
 */
const CARRIED_PAINTED_PANELS = Object.freeze({
  art: { x: 101.23, y: 210.728, width: 857.54, height: 598.052 },
  contents: { x: 102.82, y: 967.568, width: 854.36, height: 425.908 },
});

/**
 * Title and type rows below are the painted plate's opening, read keyline to
 * keyline off each frame's own pixels; the cost box is centered on the socket
 * that frame draws. Horizontal title/type edges stay at the approved inset,
 * which sits comfortably inside every painted plate.
 */
export const RUN_CARD_STANDARD_FRAME_GEOMETRY = defineGeometry({
  variant: 'standard',
  measuredSha256: '73710874141ec1c904416860d55a0be69d4dc7f5104db7eeecbfc756ca02dfe1',
  boxes: {
    ...CARRIED_PAINTED_PANELS,
    title: { x: 98.58, y: 86, width: 725.04, height: 85 },
    cost: { x: 873.17, y: 73.58, width: 117.66, height: 106.848 },
    type: { x: 98.58, y: 864, width: 854.36, height: 69 },
  },
});

export const RUN_CARD_PESTIFEROUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'pestiferous',
  measuredSha256: '1a403e5e9adad96c0bed9673acae3e26abc750d978130e9bc8e92bbca8947e9d',
  boxes: {
    ...CARRIED_PAINTED_PANELS,
    title: { x: 98.58, y: 90, width: 725.04, height: 86 },
    cost: { x: 871.17, y: 79.58, width: 117.66, height: 106.848 },
    type: { x: 98.58, y: 872, width: 854.36, height: 70 },
  },
});

export const RUN_CARD_CONCINNOUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'concinnous',
  measuredSha256: '38b1290df1067dfa3562b874478b29c3f47341d8a065c90d426cec2cdaa32cc7',
  boxes: {
    ...CARRIED_PAINTED_PANELS,
    title: { x: 98.58, y: 86, width: 725.04, height: 94 },
    cost: { x: 874.17, y: 79.58, width: 117.66, height: 106.848 },
    // This frame's plates cast a thicker bottom shadow than they do a top
    // bevel, so the opening is read to the flat face rather than to the lip.
    type: { x: 98.58, y: 877, width: 854.36, height: 67 },
  },
});

export const RUN_CARD_TACTICAL_FRAME_GEOMETRY = defineGeometry({
  variant: 'tactical',
  measuredSha256: '6c54a0a6dc48f56a3cf21c83d57d08cfbf11a501ae90f820b527c07cf40d3140',
  boxes: {
    ...CARRIED_PAINTED_PANELS,
    title: { x: 98.58, y: 86, width: 725.04, height: 87 },
    cost: { x: 872.17, y: 78.58, width: 117.66, height: 106.848 },
    type: { x: 98.58, y: 866, width: 854.36, height: 68 },
  },
});

/**
 * The owner-selected Hieratic forged-steel frame. Its plates sit lower than the
 * painted frames and its border is thicker, so the title and type rows also move
 * their left edge inside the steel while keeping the shared right edge.
 */
export const RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY = defineGeometry({
  variant: 'hieratic',
  measuredSha256: '7ae3b1945da8fefa46a264b696b0fc5695454c80c7256f879fd465a06a2d1152',
  boxes: {
    title: { x: 118, y: 94, width: 705, height: 86 },
    cost: { x: 867.17, y: 78.58, width: 117.66, height: 106.848 },
    art: { x: 106, y: 219, width: 848, height: 637 },
    type: { x: 118, y: 896, width: 834, height: 72 },
    contents: { x: 102, y: 994, width: 856, height: 407 },
  },
});

export const RUN_CARD_FRAME_GEOMETRY_BY_VARIANT: Readonly<Record<RunCardFrameVariant, RunCardFrameGeometry>> =
  Object.freeze({
    standard: RUN_CARD_STANDARD_FRAME_GEOMETRY,
    pestiferous: RUN_CARD_PESTIFEROUS_FRAME_GEOMETRY,
    concinnous: RUN_CARD_CONCINNOUS_FRAME_GEOMETRY,
    tactical: RUN_CARD_TACTICAL_FRAME_GEOMETRY,
    hieratic: RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  });

const GEOMETRY_BY_SLOT: ReadonlyMap<string, RunCardFrameGeometry> = new Map(
  RUN_CARD_FRAME_VARIANTS.map((variant) => [
    RUN_CARD_FRAME_SLOT_BY_VARIANT[variant],
    RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant],
  ]),
);

/**
 * Every frame owns its boxes. A frame is identified by the slot it is served
 * from, not by the pixels currently published there: a re-generated frame keeps
 * its own boxes rather than silently inheriting the Standard ones.
 */
export function runCardFrameGeometryForSlot(slot: string | null | undefined): RunCardFrameGeometry {
  return (slot ? GEOMETRY_BY_SLOT.get(slot) : undefined) ?? RUN_CARD_STANDARD_FRAME_GEOMETRY;
}

/** False while a frame's boxes are seeds, or were tuned against other pixels. */
export function runCardFrameGeometryMatchesPixels(
  geometry: RunCardFrameGeometry,
  frameSha256: string | null | undefined,
): boolean {
  return geometry.measuredSha256 !== null && geometry.measuredSha256 === frameSha256;
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

/** A geometry carrying owner-tuned boxes for the same frame, for the Studio instrument. */
export function runCardFrameGeometryWithBoxes(
  geometry: RunCardFrameGeometry,
  boxes: RunCardFrameBoxes,
): RunCardFrameGeometry {
  return Object.freeze({ ...geometry, boxes: Object.freeze({ ...boxes }) });
}
