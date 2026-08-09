export const RUN_CARD_FRAME_NATIVE_WIDTH = 1060;
export const RUN_CARD_FRAME_NATIVE_HEIGHT = 1484;

export const RUN_CARD_FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
export const RUN_CARD_UNCOMMON_FRAME_SLOT = 'ui/run/card-prototypes/standard-uncommon-frame-v1.png';
export const RUN_CARD_RARE_FRAME_SLOT = 'ui/run/card-prototypes/standard-rare-frame-v1.png';
export const RUN_CARD_PESTIFEROUS_FRAME_SLOT = 'ui/run/card-prototypes/pestiferous-frame-v1.png';
export const RUN_CARD_CONCINNOUS_FRAME_SLOT = 'ui/run/card-prototypes/concinnous-frame-v1.png';
export const RUN_CARD_LEGATINE_FRAME_SLOT = 'ui/run/card-prototypes/legatine-adlected-frame-v1.png';
export const RUN_CARD_HIERATIC_FRAME_SLOT = 'ui/run/card-prototypes/hieratic-frame-v1.png';
export const RUN_CARD_PRAECIPUUS_FRAME_SLOT = 'ui/run/card-prototypes/praecipuus-frame-v1.png';

export type RunCardFrameVariant =
  | 'standard'
  | 'pestiferous'
  | 'concinnous'
  | 'legatine'
  | 'hieratic'
  | 'praecipuus';

export const RUN_CARD_FRAME_VARIANTS: readonly RunCardFrameVariant[] = Object.freeze([
  'standard', 'pestiferous', 'concinnous', 'legatine', 'hieratic', 'praecipuus',
]);

export const RUN_CARD_FRAME_SLOT_BY_VARIANT: Readonly<Record<RunCardFrameVariant, string>> = Object.freeze({
  standard: RUN_CARD_FRAME_SLOT,
  pestiferous: RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  concinnous: RUN_CARD_CONCINNOUS_FRAME_SLOT,
  legatine: RUN_CARD_LEGATINE_FRAME_SLOT,
  hieratic: RUN_CARD_HIERATIC_FRAME_SLOT,
  praecipuus: RUN_CARD_PRAECIPUUS_FRAME_SLOT,
});

export const RUN_CARD_STANDARD_FRAME_SLOT_BY_RARITY: Readonly<Record<'common' | 'uncommon' | 'rare', string>> =
  Object.freeze({
    common: RUN_CARD_FRAME_SLOT,
    uncommon: RUN_CARD_UNCOMMON_FRAME_SLOT,
    rare: RUN_CARD_RARE_FRAME_SLOT,
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

export type RunCardFramePaintBounds = RunCardFrameRect;

export type RunCardFrameGeometry = Readonly<{
  id: `${RunCardFrameVariant}-v1`;
  variant: RunCardFrameVariant;
  slot: string;
  sourceWidth: typeof RUN_CARD_FRAME_NATIVE_WIDTH;
  sourceHeight: typeof RUN_CARD_FRAME_NATIVE_HEIGHT;
  /**
   * Every frame byte-identity these boxes were measured against, newest first.
   * Cutting a generated frame's flat backdrop to transparent changes its bytes
   * without moving a drawn pixel, so both identities keep the same measured
   * boxes and a live media promotion never has to land with a code deploy.
   */
  frameSha256s: readonly string[];
  /**
   * Tight native-pixel bounds of the frame's painted canvas. Layout hosts use
   * these optical keylines instead of aligning the transparent 5:7 canvas.
   */
  paintBounds: RunCardFramePaintBounds;
  boxes: RunCardFrameBoxes;
}>;

/**
 * The whole text-placement rule, shared by every frame and every card.
 *
 * Vertical: a box's text is centered in the box — centered on the INK, not on
 * the line box, which reserves descender room these numerals and caps never use
 * and would leave every line floating high. No card, frame, or type line carries
 * an offset of its own; a line that sits wrong means its box is wrong, and the
 * box is what gets tuned (ADR-0359).
 *
 * Horizontal: title and type text is inset from both plate edges by one shared
 * value; the cost reading is centered in its coin box.
 */
export type RunCardTextPlacement = Readonly<{
  insetInline: number;
  /**
   * How far the display face's ink centre sits above its line-box centre, in em.
   * Measured off the font itself and constant at every size, so one number
   * re-centres the title, type and cost lines against their own sizes.
   */
  inkCentreEm: number;
}>;

export const RUN_CARD_TEXT_PLACEMENT: RunCardTextPlacement = Object.freeze({
  // Measured from the plate opening's real edge, so the same padding now reads
  // the same on a thin painted border and on Hieratic's thicker steel one.
  insetInline: 2.25,
  inkCentreEm: .0667,
});

/**
 * The coin's flat striking face, measured across the middle of the drawn coin
 * (63.8 native px of the 105px coin). The cost numeral is sized to sit inside
 * it rather than crowding the rim.
 */
export const RUN_CARD_COIN_FACE_CQW = 6.01;

/** The share of that face the widest numeral of a given length may occupy. */
export const RUN_CARD_COIN_FACE_FILL = .72;

/**
 * The display face's widest numeral at each length, in em. Digits are not equal
 * width — "1" is narrower than "0" — so a two-digit reading is measured as a
 * pair rather than assumed to be twice one digit.
 */
const NUMERAL_EM_WIDTH: readonly number[] = Object.freeze([0, .4375, .8125]);

/**
 * The cost numeral's size: the approved size, reduced only as far as it takes to
 * keep the reading inside the coin's face. One digit never reaches the cap, so
 * the common card is unchanged and two digits stop touching the rim.
 */
export function runCardCostSizeCqw(cost: number, approvedSizeCqw: number): number {
  const digits = Math.abs(Math.trunc(cost)).toString().length;
  const emWidth = NUMERAL_EM_WIDTH[digits] ?? NUMERAL_EM_WIDTH[NUMERAL_EM_WIDTH.length - 1] * digits / 2;
  const fits = (RUN_CARD_COIN_FACE_CQW * RUN_CARD_COIN_FACE_FILL) / emWidth;
  return Math.round(Math.min(approvedSizeCqw, fits) * 100) / 100;
}

const SHA256 = /^[0-9a-f]{64}$/;

function defineGeometry(
  geometry: Omit<RunCardFrameGeometry, 'id' | 'slot' | 'sourceWidth' | 'sourceHeight'>,
): RunCardFrameGeometry {
  if (!geometry.frameSha256s.length) throw new Error(`${geometry.variant} declares no frame SHA-256`);
  for (const sha256 of geometry.frameSha256s) {
    if (!SHA256.test(sha256)) throw new Error(`${geometry.variant} frame SHA-256 is invalid`);
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
  const paint = geometry.paintBounds;
  if (
    !Number.isFinite(paint.x) || !Number.isFinite(paint.y)
    || !Number.isFinite(paint.width) || !Number.isFinite(paint.height)
    || paint.x < 0 || paint.y < 0 || paint.width <= 0 || paint.height <= 0
    || paint.x + paint.width > RUN_CARD_FRAME_NATIVE_WIDTH
    || paint.y + paint.height > RUN_CARD_FRAME_NATIVE_HEIGHT
  ) throw new Error(`${geometry.variant} paint bounds are outside the native frame`);
  return Object.freeze({
    ...geometry,
    id: `${geometry.variant}-v1`,
    slot: RUN_CARD_FRAME_SLOT_BY_VARIANT[geometry.variant],
    sourceWidth: RUN_CARD_FRAME_NATIVE_WIDTH,
    sourceHeight: RUN_CARD_FRAME_NATIVE_HEIGHT,
    frameSha256s: Object.freeze([...geometry.frameSha256s]),
    paintBounds: Object.freeze({ ...geometry.paintBounds }),
    // Declared in one order regardless of how a frame's literal groups its boxes,
    // so every geometry enumerates identically.
    boxes: Object.freeze(Object.fromEntries(
      RUN_CARD_FRAME_BOX_NAMES.map((name) => [name, geometry.boxes[name]]),
    ) as RunCardFrameBoxes),
  });
}

/**
 * Every box below is the opening that frame paints, read off its own pixels on
 * all four edges — including the rounded ends and corner studs no text will ever
 * reach, because the opening is the visual unit the text is padded against. The
 * cost box is centered on the socket the frame draws.
 *
 * The illustration windows and contents panels were measured the same way. They
 * are not identical between frames, so the reviewed density ladder (ADR-0270)
 * now answers to each frame's real panel: Pestiferous, whose panel is 15px
 * shorter than the borrowed one, takes a two-cell card one step denser.
 */
export const RUN_CARD_STANDARD_FRAME_GEOMETRY = defineGeometry({
  variant: 'standard',
  frameSha256s: [
    'a5ff21ff0c821f93bb78338401c663169ed7a08e295754ee00fefc8d359a4eca',
    '037ac0896d4a9307b27ff909197b1d769c04311a2deb59e5ae7d2041bce3e2b1',
    '73710874141ec1c904416860d55a0be69d4dc7f5104db7eeecbfc756ca02dfe1',
  ],
  paintBounds: { x: 26, y: 42, width: 1009, height: 1402 },
  boxes: {
    art: { x: 94, y: 207, width: 870, height: 611 },
    contents: { x: 88, y: 959, width: 884, height: 433 },
    title: { x: 94, y: 86, width: 762, height: 85 },
    cost: { x: 873.17, y: 73.58, width: 117.66, height: 106.848 },
    type: { x: 89, y: 864, width: 882, height: 69 },
  },
});

export const RUN_CARD_PESTIFEROUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'pestiferous',
  frameSha256s: ['1a403e5e9adad96c0bed9673acae3e26abc750d978130e9bc8e92bbca8947e9d'],
  paintBounds: { x: 26, y: 43, width: 1009, height: 1402 },
  boxes: {
    art: { x: 108, y: 221, width: 844, height: 590 },
    contents: { x: 107, y: 976, width: 855, height: 411 },
    title: { x: 94, y: 90, width: 758, height: 86 },
    cost: { x: 871.17, y: 79.58, width: 117.66, height: 106.848 },
    type: { x: 94, y: 872, width: 869, height: 70 },
  },
});

export const RUN_CARD_CONCINNOUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'concinnous',
  // Normalised to the shared painted card box; boxes remapped through the same
  // transform, so they describe these pixels (ADR-0360).
  frameSha256s: ['310629d033eebd8f2b1227de1b8a42e1a6b86087327111c145b8f715d4481bcb'],
  paintBounds: { x: 26, y: 42, width: 1009, height: 1402 },
  boxes: {
    art: { x: 103, y: 217.74, width: 853, height: 603.25 },
    contents: { x: 91, y: 962.19, width: 879, height: 431.46 },
    title: { x: 92, y: 87.42, width: 767, height: 92.81 },
    cost: { x: 874.17, y: 81.08, width: 117.66, height: 105.49 },
    // This frame's plates cast a thicker bottom shadow than they do a top
    // bevel, so the opening is read to the flat face rather than to the lip.
    type: { x: 91, y: 868.39, width: 879, height: 66.15 },
  },
});

export const RUN_CARD_LEGATINE_FRAME_GEOMETRY = defineGeometry({
  variant: 'legatine',
  frameSha256s: ['6c54a0a6dc48f56a3cf21c83d57d08cfbf11a501ae90f820b527c07cf40d3140'],
  paintBounds: { x: 26, y: 42, width: 1009, height: 1402 },
  boxes: {
    art: { x: 97, y: 209, width: 865, height: 608 },
    contents: { x: 90, y: 965, width: 881, height: 429 },
    title: { x: 93, y: 86, width: 764, height: 87 },
    cost: { x: 872.17, y: 78.58, width: 117.66, height: 106.848 },
    type: { x: 90, y: 866, width: 878, height: 68 },
  },
});

/**
 * The owner-selected Hieratic forged-steel frame. Its plates sit lower than the
 * painted frames, and each is bounded by a raised lip with a recessed channel
 * inside it: the opening is the diamond-plate face past that channel (x 99 on
 * the type plate), not the channel's inner shadow.
 */
export const RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY = defineGeometry({
  variant: 'hieratic',
  // Normalised to the shared painted card box; boxes remapped through the same
  // transform, so they describe these pixels (ADR-0360).
  frameSha256s: ['6552cae59d0d1b404a466b2d37fb6d0a0e6dcdcd60b171ec4979f8a50c610348'],
  paintBounds: { x: 26, y: 42, width: 1009, height: 1402 },
  boxes: {
    title: { x: 98.07, y: 95.05, width: 751.75, height: 86.46 },
    cost: { x: 868, y: 79.9, width: 117.78, height: 104.98 },
    art: { x: 105.08, y: 212.95, width: 851.84, height: 629.77 },
    type: { x: 99.07, y: 883, width: 862.86, height: 70.74 },
    contents: { x: 103.08, y: 989.11, width: 853.85, height: 384.15 },
  },
});

/**
 * Praecipuus owns the royal-purple frame selected for His Grace. Its generated
 * material was transferred onto the accepted Hieratic alpha mask at native 1x,
 * so the two frames deliberately share measured openings without sharing a
 * semantic slot or pixel identity (ADR-0413).
 */
export const RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY = defineGeometry({
  variant: 'praecipuus',
  frameSha256s: ['93ee3e1497ae1a930ca9d8d0242fd8b1fd93cd30da01511662ef2c48ed9a062e'],
  paintBounds: { x: 26, y: 42, width: 1009, height: 1402 },
  boxes: { ...RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY.boxes },
});

export const RUN_CARD_FRAME_GEOMETRY_BY_VARIANT: Readonly<Record<RunCardFrameVariant, RunCardFrameGeometry>> =
  Object.freeze({
    standard: RUN_CARD_STANDARD_FRAME_GEOMETRY,
    pestiferous: RUN_CARD_PESTIFEROUS_FRAME_GEOMETRY,
    concinnous: RUN_CARD_CONCINNOUS_FRAME_GEOMETRY,
    legatine: RUN_CARD_LEGATINE_FRAME_GEOMETRY,
    hieratic: RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
    praecipuus: RUN_CARD_PRAECIPUUS_FRAME_GEOMETRY,
  });

const GEOMETRY_BY_SLOT: ReadonlyMap<string, RunCardFrameGeometry> = new Map([
  ...RUN_CARD_FRAME_VARIANTS.map((variant) => [
    RUN_CARD_FRAME_SLOT_BY_VARIANT[variant],
    RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant],
  ] as const),
  [RUN_CARD_UNCOMMON_FRAME_SLOT, RUN_CARD_STANDARD_FRAME_GEOMETRY],
  [RUN_CARD_RARE_FRAME_SLOT, RUN_CARD_STANDARD_FRAME_GEOMETRY],
]);

/**
 * Every frame owns its boxes. A frame is identified by the slot it is served
 * from, not by the pixels currently published there: a re-generated frame keeps
 * its own boxes rather than silently inheriting the Standard ones.
 */
export function runCardFrameGeometryForSlot(slot: string | null | undefined): RunCardFrameGeometry {
  return (slot ? GEOMETRY_BY_SLOT.get(slot) : undefined) ?? RUN_CARD_STANDARD_FRAME_GEOMETRY;
}

/** Whether the pixels a frame slot is serving are ones these boxes were measured on. */
export function runCardFrameGeometryKnowsPixels(
  geometry: RunCardFrameGeometry,
  frameSha256: string | null | undefined,
): boolean {
  return typeof frameSha256 === 'string' && geometry.frameSha256s.includes(frameSha256);
}

function percentage(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`;
}

export type RunCardFramePaintInsetRatios = Readonly<{
  blockStart: number;
  blockEnd: number;
}>;

/**
 * Optical block insets expressed against card width. The face scales from its
 * native width, so these unitless ratios remain exact at every rendered size.
 */
export function runCardFramePaintInsetRatios(
  geometry: RunCardFrameGeometry,
): RunCardFramePaintInsetRatios {
  return Object.freeze({
    blockStart: geometry.paintBounds.y / geometry.sourceWidth,
    blockEnd: (geometry.sourceHeight - geometry.paintBounds.y - geometry.paintBounds.height)
      / geometry.sourceWidth,
  });
}

export type RunCardPrintBoxVariables = Readonly<Record<string, string>>;

/**
 * Where a printed card actually sits inside its 5:7 canvas, as shares of that canvas.
 *
 * Every frame is drawn 1009x1402 at (26,42) of 1060x1484: the transparent margin is part of the
 * printed object, not slack. The face-DOWN rasters are painted corner to corner instead, so a back
 * given the same BOX as a face printed a whole card 5.05% wider and 5.85% taller than the offer
 * standing next to it — most visible in Sectio, where buying an offer reveals its pile's back
 * beside the ones still face up.
 *
 * Seating the back's raster in this box is what makes the two one size, and it is read off the
 * frames' own measured paint bounds so a re-cut frame carries the back with it rather than leaving
 * a second set of numbers to remember.
 */
export function runCardPrintBoxVariables(
  geometry: RunCardFrameGeometry = RUN_CARD_STANDARD_FRAME_GEOMETRY,
): RunCardPrintBoxVariables {
  return Object.freeze({
    '--run-card-print-inline-start': percentage(geometry.paintBounds.x, geometry.sourceWidth),
    '--run-card-print-block-start': percentage(geometry.paintBounds.y, geometry.sourceHeight),
    '--run-card-print-inline-size': percentage(geometry.paintBounds.width, geometry.sourceWidth),
    '--run-card-print-block-size': percentage(geometry.paintBounds.height, geometry.sourceHeight),
  });
}

/** Converts native frame-pixel boxes into the shared face's responsive CSS variables. */
export function runCardFrameGeometryVariables(
  geometry: RunCardFrameGeometry,
): Readonly<Record<string, string>> {
  return Object.fromEntries([
    ...RUN_CARD_FRAME_BOX_NAMES.flatMap((name) => {
      const box = geometry.boxes[name];
      return [
        [`--run-card-${name}-left`, percentage(box.x, geometry.sourceWidth)],
        [`--run-card-${name}-top`, percentage(box.y, geometry.sourceHeight)],
        [`--run-card-${name}-width`, percentage(box.width, geometry.sourceWidth)],
        [`--run-card-${name}-height`, percentage(box.height, geometry.sourceHeight)],
      ];
    }),
    // The contents panel's height again, this time as a card-width length rather than a share of
    // the card's height. A percentage of a height cannot be arithmetic with the flavour's own size,
    // and dividing the panel between the diagram and the flavour is exactly that arithmetic.
    ['--run-card-contents-block', `${((geometry.boxes.contents.height / geometry.sourceWidth) * 100).toFixed(4)}cqw`],
    // The coin's flat striking face, so a mark struck on the coin is sized against the metal it
    // lands on rather than against the cost box that surrounds it.
    ['--run-card-coin-face', `${RUN_CARD_COIN_FACE_CQW}cqw`],
  ]);
}

/** A geometry carrying owner-tuned boxes for the same frame, for the Studio instrument. */
export function runCardFrameGeometryWithBoxes(
  geometry: RunCardFrameGeometry,
  boxes: RunCardFrameBoxes,
): RunCardFrameGeometry {
  return Object.freeze({ ...geometry, boxes: Object.freeze({ ...boxes }) });
}
