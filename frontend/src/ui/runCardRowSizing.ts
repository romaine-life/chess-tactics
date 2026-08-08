import sizing from './runCardRowSizing.json';

/**
 * How large the Run prints a card row (ADR-0519).
 *
 * The Bona Vacantia grant and the Sectio are card screens: the cards are the
 * decision, so the row prints the largest 5:7 face that fits its own box in
 * BOTH axes, capped by an owner-tuned maximum. The tuned numbers live in the
 * Git-owned `runCardRowSizing.json` beside this module and are edited in the
 * Studio's Card Size instrument, which writes that exact file.
 */

/** Every card face is printed 5:7; every fit below preserves it. */
export const RUN_CARD_ASPECT_WIDTH = 5;
export const RUN_CARD_ASPECT_HEIGHT = 7;

export interface RunCardRowSizing {
  /** The widest a single card face may render, in CSS pixels. */
  maxWidth: number;
  /** Share of the row's own block size one card may occupy, as a percentage. */
  heightFill: number;
  /** Gutter between neighbouring cards, in CSS pixels. */
  gap: number;
}

export const RUN_CARD_ROW_SIZING_LIMITS = Object.freeze({
  maxWidth: Object.freeze({ min: 180, max: 560 }),
  heightFill: Object.freeze({ min: 40, max: 100 }),
  gap: Object.freeze({ min: 0, max: 64 }),
});

export const RUN_CARD_ROW_SIZING_DEFAULTS: Readonly<RunCardRowSizing> = Object.freeze({
  maxWidth: sizing.card.maxWidth,
  heightFill: sizing.card.heightFill,
  gap: sizing.card.gap,
});

export interface RunCardRowBox {
  width: number;
  height: number;
}

function bounded(value: number, key: keyof RunCardRowSizing): number {
  const limits = RUN_CARD_ROW_SIZING_LIMITS[key];
  if (!Number.isFinite(value)) return RUN_CARD_ROW_SIZING_DEFAULTS[key];
  return Math.min(limits.max, Math.max(limits.min, value));
}

/** The same tuning with every field pulled back inside its published limits. */
export function runCardRowSizingWithin(tuning: RunCardRowSizing): RunCardRowSizing {
  return {
    maxWidth: bounded(tuning.maxWidth, 'maxWidth'),
    heightFill: bounded(tuning.heightFill, 'heightFill'),
    gap: bounded(tuning.gap, 'gap'),
  };
}

/**
 * The width every card in a row renders at, in CSS pixels — the largest face
 * that fits the measured box in both axes, never wider than the tuned maximum.
 *
 * Returns 0 for an unmeasured box, which is the caller's signal to leave the
 * shared `.run-card-grid` ladder in charge rather than print a zero-width card.
 */
export function runCardRowCardWidth(input: {
  count: number;
  box: RunCardRowBox;
  sizing?: RunCardRowSizing;
}): number {
  const { count, box } = input;
  const tuning = runCardRowSizingWithin(input.sizing ?? RUN_CARD_ROW_SIZING_DEFAULTS);
  if (!Number.isInteger(count) || count < 1) return 0;
  if (!(box.width > 0) || !(box.height > 0)) return 0;
  const widthFit = (box.width - (count - 1) * tuning.gap) / count;
  const heightFit = (box.height * (tuning.heightFill / 100) * RUN_CARD_ASPECT_WIDTH) / RUN_CARD_ASPECT_HEIGHT;
  // Whole pixels only: a half-pixel track resamples this pixel art.
  const width = Math.floor(Math.min(tuning.maxWidth, widthFit, heightFit));
  return width > 0 ? width : 0;
}

/** The block size a row of that card width occupies, for reporting and fitting checks. */
export function runCardRowCardHeight(cardWidth: number): number {
  return Math.round((cardWidth * RUN_CARD_ASPECT_HEIGHT) / RUN_CARD_ASPECT_WIDTH);
}
