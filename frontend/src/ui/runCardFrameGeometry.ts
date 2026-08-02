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
    boxes: Object.freeze(geometry.boxes),
  });
}

/**
 * The boxes the four painted-frame variants shared before they were separable,
 * expressed in their native 1060x1484 pixels. The title and type rows carry the
 * text offsets that used to be applied globally on top of them, so day-one
 * pixels are unchanged while the box became the single authority.
 */
const SEEDED_PAINTED_BOXES: RunCardFrameBoxes = Object.freeze({
  title: { x: 98.58, y: 86.072, width: 725.04, height: 92.008 },
  // Centered on the drawn coin socket shared by the standard, pestiferous,
  // and tactical frames (measured seat center ~(932.5, 130.5)).
  cost: { x: 873.67, y: 77.18, width: 117.66, height: 106.848 },
  art: { x: 101.23, y: 210.728, width: 857.54, height: 598.052 },
  type: { x: 98.58, y: 876.408, width: 854.36, height: 69.006 },
  contents: { x: 102.82, y: 967.568, width: 854.36, height: 425.908 },
});

export const RUN_CARD_STANDARD_FRAME_GEOMETRY = defineGeometry({
  variant: 'standard',
  measuredSha256: null,
  boxes: { ...SEEDED_PAINTED_BOXES },
});

export const RUN_CARD_PESTIFEROUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'pestiferous',
  measuredSha256: null,
  boxes: { ...SEEDED_PAINTED_BOXES },
});

export const RUN_CARD_CONCINNOUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'concinnous',
  measuredSha256: null,
  boxes: { ...SEEDED_PAINTED_BOXES },
});

export const RUN_CARD_TACTICAL_FRAME_GEOMETRY = defineGeometry({
  variant: 'tactical',
  measuredSha256: null,
  boxes: { ...SEEDED_PAINTED_BOXES },
});

/**
 * The owner-selected Hieratic forged-steel frame. Its panels are lower than the
 * painted frames, so it was the first variant to need boxes of its own.
 */
export const RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY = defineGeometry({
  variant: 'hieratic',
  measuredSha256: null,
  boxes: {
    title: { x: 98.58, y: 95, width: 725.04, height: 86 },
    cost: { x: 865.42, y: 82.076, width: 117.66, height: 106.848 },
    art: { x: 106, y: 219, width: 848, height: 637 },
    type: { x: 98.58, y: 908.72, width: 854.36, height: 72 },
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
