import type { CSSProperties } from 'react';

/**
 * What the Run's OFFERED cards' idle motion and light ship as.
 *
 * The Bona Vacantia grant and the Sectio are the two screens whose whole content is a small
 * number of cards waiting to be chosen, and a card that sits perfectly still reads as a
 * thumbnail rather than as goods on a table. The lipsana on the Conflict mat solved this
 * already — they breathe and give off a little light — so the cards take the same treatment
 * rather than inventing a second vocabulary for it (see the lipsanon block in style.css).
 *
 * The card is not the relic, though, and two things change with the size of the object:
 *
 *  - The BOB is slower and shallower in proportion. A 64px relic rising 5px is lifting 8% of
 *    itself; a card doing that would flap. The card rises a similar number of PIXELS over a
 *    longer cycle, so it drifts where the relic bobs.
 *  - The LIGHT is cast by the card's own silhouette, as the relic's is, but it is thrown much
 *    wider: a 30px bloom around a 64px sprite would swallow it, and around a 320px card it is
 *    the spill onto the table that a card of that size would actually make.
 *
 * style.css carries these same numbers as the custom-property fallbacks; the Studio's Card Size
 * instrument resets to them — a reset returns to the committed value, never to zero or to a
 * slider's floor (ADR-0057).
 */

/** How far the drift rises, in whole pixels. */
export const RUN_CARD_FLOAT_COMMITTED_RISE = 8;
/** The base cycle every seat's own clock scales from, in seconds. */
export const RUN_CARD_FLOAT_COMMITTED_PERIOD = 4.6;
/** Multiplier on the emanation's radius and opacity. 0 puts the light out. */
export const RUN_CARD_GLOW_COMMITTED = 1;
/**
 * How deeply the emanation breathes, as a share of its bright end. 0 collapses the pulse onto
 * that bright end, which is exactly what a hovered card holds.
 */
export const RUN_CARD_GLOW_COMMITTED_PULSE = 1;
/**
 * What a considered card gets: the light opens past its steady level (flare), a contact shadow
 * appears beneath it (lift), and it rises this many whole pixels off the table. Settling alone
 * does not read as a hover -- the other cards are somewhere in their own drift, and one of them
 * is always near the top of it.
 */
export const RUN_CARD_HOVER_FLARE_COMMITTED = 1;
export const RUN_CARD_HOVER_LIFT_COMMITTED = 1;
export const RUN_CARD_HOVER_RAISE_COMMITTED = 7;
/** `linear` interpolates the drift's stops into a float; `steps(1, end)` holds each one. */
export const RUN_CARD_FLOAT_COMMITTED_TIMING = 'linear';
export const RUN_CARD_FLOAT_STEPPED_TIMING = 'steps(1, end)';

export interface RunCardLifeTuning {
  /** How far the drift rises, in whole pixels. */
  rise: number;
  /** The base cycle every seat's own clock scales from, in seconds. */
  period: number;
  /** Interpolate the drift's stops (a smooth float) or hold each one (a pixel-art bob). */
  stepped: boolean;
  /** Multiplier on the emanation's radius and opacity. */
  glow: number;
  /** How deeply the emanation breathes, as a share of its bright end. 0 is one steady light. */
  pulse: number;
  /** How far a hovered card's light opens past its steady level. 0 leaves it untouched. */
  hoverFlare: number;
  /** The contact shadow under a hovered card. 0 removes it. */
  hoverLift: number;
  /** How far a hovered card rises off the table, in whole pixels. */
  hoverRaise: number;
}

export const RUN_CARD_LIFE_COMMITTED: Readonly<RunCardLifeTuning> = Object.freeze({
  rise: RUN_CARD_FLOAT_COMMITTED_RISE,
  period: RUN_CARD_FLOAT_COMMITTED_PERIOD,
  stepped: false,
  glow: RUN_CARD_GLOW_COMMITTED,
  pulse: RUN_CARD_GLOW_COMMITTED_PULSE,
  hoverFlare: RUN_CARD_HOVER_FLARE_COMMITTED,
  hoverLift: RUN_CARD_HOVER_LIFT_COMMITTED,
  hoverRaise: RUN_CARD_HOVER_RAISE_COMMITTED,
});

export const RUN_CARD_LIFE_LIMITS = Object.freeze({
  rise: Object.freeze({ min: 0, max: 24, step: 1, nudge: 1 }),
  period: Object.freeze({ min: 1.2, max: 12, step: 0.1, nudge: 0.1 }),
  glow: Object.freeze({ min: 0, max: 2.5, step: 0.05, nudge: 0.05 }),
  pulse: Object.freeze({ min: 0, max: 1, step: 0.05, nudge: 0.05 }),
  hoverFlare: Object.freeze({ min: 0, max: 2, step: 0.05, nudge: 0.05 }),
  hoverLift: Object.freeze({ min: 0, max: 2, step: 0.05, nudge: 0.05 }),
  hoverRaise: Object.freeze({ min: 0, max: 24, step: 1, nudge: 1 }),
});

const LIFE_KEYS = ['rise', 'period', 'stepped', 'glow', 'pulse', 'hoverFlare', 'hoverLift', 'hoverRaise'] as const;

export function sameRunCardLife(left: RunCardLifeTuning, right: RunCardLifeTuning): boolean {
  return LIFE_KEYS.every((key) => left[key] === right[key]);
}

/** The tuned life as the custom properties style.css reads. */
export function runCardLifeStyle(life: RunCardLifeTuning): CSSProperties {
  return {
    '--run-card-float-rise': `${life.rise}px`,
    '--run-card-float-period': `${life.period}s`,
    '--run-card-float-timing': life.stepped ? RUN_CARD_FLOAT_STEPPED_TIMING : RUN_CARD_FLOAT_COMMITTED_TIMING,
    '--run-card-glow': `${life.glow}`,
    '--run-card-glow-pulse': `${life.pulse}`,
    '--run-card-hover-flare': `${life.hoverFlare}`,
    '--run-card-hover-lift': `${life.hoverLift}`,
    '--run-card-hover-raise': `${life.hoverRaise}px`,
  } as CSSProperties;
}

/** The CSS an auditioning surface injects to preview a tuning it has not committed. */
export function runCardLifeCss(life: RunCardLifeTuning): string {
  const declarations = Object.entries(runCardLifeStyle(life) as Record<string, string>)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n');
  return `:root {\n${declarations}\n}\n`;
}

/**
 * One seat's own clock. Three cards on one clock read as a single animated strip rather than
 * three loose objects on a table, so each is offset in phase and runs at a slightly different
 * rate — while all of them still scale from the one period the instrument tunes.
 *
 * The offsets are deliberately not multiples of the spread: give two seats the same effective
 * cycle and they re-synchronise a few minutes in, which is when a screen that had felt alive
 * starts pumping in unison.
 */
export function runCardFloatClock(index: number): CSSProperties {
  return {
    '--run-card-float-delay': `${index * -2.3}s`,
    '--run-card-float-spread': `${1 + index * 0.11}`,
  } as CSSProperties;
}
