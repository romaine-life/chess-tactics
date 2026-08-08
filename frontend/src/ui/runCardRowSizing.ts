import sizing from './runCardRowSizing.json';

/**
 * How large the Run prints a card row (ADR-0522).
 *
 * The Bona Vacantia grant and the Sectio are card screens: the cards are the
 * decision, so the row starts from the largest 5:7 face that fits its own lane
 * in BOTH axes and then takes the owner-tuned share of it. The tuned numbers
 * live in the Git-owned `runCardRowSizing.json` beside this module and are
 * edited in the Studio's Card Size instrument, which writes that exact file.
 */

/** Every card face is printed 5:7; every fit below preserves it. */
export const RUN_CARD_ASPECT_WIDTH = 5;
export const RUN_CARD_ASPECT_HEIGHT = 7;

export interface RunCardRowSizing {
  /**
   * Share of the largest card that fits the lane, as a percentage. This is the
   * knob: it always moves the cards, because what it scales is whatever the
   * room happens to allow rather than a number that may already be slack.
   */
  size: number;
  /**
   * Hard ceiling in CSS pixels, for windows large enough that a full-size row
   * would be absurd. On an ordinary window the lane binds first and this does
   * nothing — which is what a ceiling is for.
   */
  maxWidth: number;
  /** Gutter between neighbouring cards, in CSS pixels. */
  gap: number;
}

export const RUN_CARD_ROW_SIZING_LIMITS = Object.freeze({
  size: Object.freeze({ min: 40, max: 100 }),
  maxWidth: Object.freeze({ min: 200, max: 800 }),
  gap: Object.freeze({ min: 0, max: 64 }),
});

export const RUN_CARD_ROW_SIZING_DEFAULTS: Readonly<RunCardRowSizing> = Object.freeze({
  size: sizing.card.size,
  maxWidth: sizing.card.maxWidth,
  gap: sizing.card.gap,
});

/**
 * The custom properties an auditioning surface may set to override the baseline
 * without saving it. The Studio's Card Size instrument injects these into the
 * live Run route it is previewing, the same same-origin handshake every other
 * dressing room uses; nothing in the shipped app sets them.
 */
export const RUN_CARD_ROW_SIZING_PROPERTIES: Readonly<Record<keyof RunCardRowSizing, string>> = Object.freeze({
  size: '--run-card-size',
  maxWidth: '--run-card-max-width',
  gap: '--run-card-gap',
});

export interface RunCardRowBox {
  width: number;
  height: number;
}

const KEYS = Object.keys(RUN_CARD_ROW_SIZING_LIMITS) as (keyof RunCardRowSizing)[];

function bounded(value: number, key: keyof RunCardRowSizing): number {
  const limits = RUN_CARD_ROW_SIZING_LIMITS[key];
  if (!Number.isFinite(value)) return RUN_CARD_ROW_SIZING_DEFAULTS[key];
  return Math.min(limits.max, Math.max(limits.min, value));
}

export function sameRunCardRowSizing(left: RunCardRowSizing, right: RunCardRowSizing): boolean {
  return KEYS.every((key) => left[key] === right[key]);
}

/** The same tuning with every field pulled back inside its published limits. */
export function runCardRowSizingWithin(tuning: RunCardRowSizing): RunCardRowSizing {
  return {
    size: bounded(tuning.size, 'size'),
    maxWidth: bounded(tuning.maxWidth, 'maxWidth'),
    gap: bounded(tuning.gap, 'gap'),
  };
}

/**
 * The baseline, overridden by whichever audition properties are set on the row.
 * An unset or unreadable property leaves that field on the shipped number, so a
 * partial injection is a partial override rather than a broken row.
 */
export function runCardRowSizingFromStyle(style: CSSStyleDeclaration | null): RunCardRowSizing {
  if (!style) return { ...RUN_CARD_ROW_SIZING_DEFAULTS };
  const read = (key: keyof RunCardRowSizing): number => {
    const raw = style.getPropertyValue(RUN_CARD_ROW_SIZING_PROPERTIES[key]).trim();
    const value = raw ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(value) ? bounded(value, key) : RUN_CARD_ROW_SIZING_DEFAULTS[key];
  };
  return Object.fromEntries(KEYS.map((key) => [key, read(key)])) as unknown as RunCardRowSizing;
}

/** The CSS an auditioning surface injects to preview a tuning it has not saved. */
export function runCardRowSizingCss(tuning: RunCardRowSizing): string {
  const declarations = KEYS
    .map((key) => `  ${RUN_CARD_ROW_SIZING_PROPERTIES[key]}: ${runCardRowSizingWithin(tuning)[key]};`)
    .join('\n');
  return `:root {\n${declarations}\n}\n`;
}

export interface RunCardRowFit {
  /** The widest card the lane can hold side by side, before the tuned share. */
  fitWidth: number;
  /** The widest card the lane is tall enough for, before the tuned share. */
  fitHeight: number;
  /** What the printed width answers to. */
  boundBy: 'lane width' | 'lane height' | 'the ceiling';
  /** The printed card width, in whole CSS pixels; 0 when the lane is unmeasured. */
  cardWidth: number;
}

/**
 * What a row of `count` cards prints in a lane of `box`. Returns a zero width
 * for an unmeasured lane, which is the caller's signal to leave the shared
 * `.run-card-grid` ladder in charge rather than print a zero-width card.
 */
export function runCardRowFit(input: {
  count: number;
  box: RunCardRowBox;
  sizing?: RunCardRowSizing;
}): RunCardRowFit {
  const { count, box } = input;
  const tuning = runCardRowSizingWithin(input.sizing ?? RUN_CARD_ROW_SIZING_DEFAULTS);
  const empty: RunCardRowFit = { fitWidth: 0, fitHeight: 0, boundBy: 'lane width', cardWidth: 0 };
  if (!Number.isInteger(count) || count < 1) return empty;
  if (!(box.width > 0) || !(box.height > 0)) return empty;
  const fitWidth = (box.width - (count - 1) * tuning.gap) / count;
  const fitHeight = (box.height * RUN_CARD_ASPECT_WIDTH) / RUN_CARD_ASPECT_HEIGHT;
  const fits = Math.min(fitWidth, fitHeight);
  const wanted = fits * (tuning.size / 100);
  // Whole pixels only: a half-pixel track resamples this pixel art.
  const cardWidth = Math.max(0, Math.floor(Math.min(tuning.maxWidth, wanted)));
  return {
    fitWidth,
    fitHeight,
    boundBy: tuning.maxWidth < wanted ? 'the ceiling' : fitHeight < fitWidth ? 'lane height' : 'lane width',
    cardWidth,
  };
}

/** The width every card in a row renders at, in CSS pixels. */
export function runCardRowCardWidth(input: {
  count: number;
  box: RunCardRowBox;
  sizing?: RunCardRowSizing;
}): number {
  return runCardRowFit(input).cardWidth;
}

/** The block size a row of that card width occupies, for reporting and fitting checks. */
export function runCardRowCardHeight(cardWidth: number): number {
  return Math.round((cardWidth * RUN_CARD_ASPECT_HEIGHT) / RUN_CARD_ASPECT_WIDTH);
}
