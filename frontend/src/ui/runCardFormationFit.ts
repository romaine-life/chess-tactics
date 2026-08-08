import type { CSSProperties } from 'react';

/**
 * How large a card's formation diagram is allowed to grow into the room it has.
 *
 * The diagram used to be drawn at ONE fixed size whatever the card granted, so a card granting a
 * single unit spent about a seventh of its contents panel and a card granting four spent a third.
 * The panel is the same panel; the one-seat card simply left most of it blank, and the lone figure
 * standing in that blank read as small rather than as singular.
 *
 * It now fits: the diagram takes the width the panel leaves and the height the card's flavour
 * leaves, and every length in it is a multiple of one tile, so the whole drawing scales together.
 * Left uncapped that fills the panel completely, which overshoots — a one-seat card would print a
 * seat several times the size of any seat on the card beside it, and the diagrams would stop
 * reading as the same board. The cap is where that stops.
 *
 * It is a multiple of the size the card has always printed, so 1 is exactly the committed diagram
 * and the cards that already fill their panel are untouched by any value above it. style.css
 * carries the same number as the custom property's fallback, and the Studio's Card Fit instrument
 * resets to it — a reset returns to the committed value, never to a slider's floor (ADR-0057).
 */
export const RUN_CARD_FORMATION_MAX_SCALE_COMMITTED = 1.45;

export interface RunCardFormationFitTuning {
  /** The largest a diagram may print, as a multiple of the committed tile size. */
  maxScale: number;
}

export const RUN_CARD_FORMATION_FIT_COMMITTED: Readonly<RunCardFormationFitTuning> = Object.freeze({
  maxScale: RUN_CARD_FORMATION_MAX_SCALE_COMMITTED,
});

export const RUN_CARD_FORMATION_FIT_LIMITS = Object.freeze({
  maxScale: Object.freeze({ min: 1, max: 3, step: .05, nudge: .05 }),
});

export function sameRunCardFormationFit(
  left: RunCardFormationFitTuning,
  right: RunCardFormationFitTuning,
): boolean {
  return left.maxScale === right.maxScale;
}

/** The tuned fit as the custom property style.css reads. */
export function runCardFormationFitStyle(fit: RunCardFormationFitTuning): CSSProperties {
  return { '--run-card-formation-max-scale': `${fit.maxScale}` } as CSSProperties;
}

/** The CSS an auditioning surface injects to preview a cap it has not committed. */
export function runCardFormationFitCss(fit: RunCardFormationFitTuning): string {
  const declarations = Object.entries(runCardFormationFitStyle(fit) as Record<string, string>)
    .map(([property, value]) => `  ${property}: ${value};`)
    .join('\n');
  return `:root {\n${declarations}\n}\n`;
}
