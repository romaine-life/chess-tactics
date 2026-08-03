import { liveMediaForSlot } from '@chess-tactics/board-render';
import type { CSSProperties } from 'react';

/**
 * The surface the Conflict's relics are laid out on. Its own runtime slot rather than a
 * workspace background: a workspace background covers the whole screen, and this is one
 * object sitting on it, sized against the relics rather than against the viewport.
 *
 * Decorative — an unaccepted slot leaves the relics on the backdrop alone rather than
 * throwing the screen away.
 */
export const RUN_RELIC_MAT_SLOT = 'ui/run/bona-vacantia/mat.png';

export function installedRelicMatUrl(): string | null {
  try {
    return liveMediaForSlot(RUN_RELIC_MAT_SLOT).media?.immutableUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * What the relics' idle motion and light SHIP as. style.css carries these same numbers as
 * the custom-property fallbacks, and the Studio's Relic Mat viewer resets to them — a reset
 * returns to the committed value, never to zero or to a slider's floor (ADR-0057).
 */
export const RELIC_FLOAT_COMMITTED_RISE = 5;
export const RELIC_FLOAT_COMMITTED_PERIOD = 3.4;
export const RELIC_GLOW_COMMITTED = 1;
/** `linear` interpolates the bob's stops into a float; `steps(1, end)` holds each one. */
export const RELIC_FLOAT_COMMITTED_TIMING = 'linear';
export const RELIC_FLOAT_STEPPED_TIMING = 'steps(1, end)';

/**
 * One offer's own clock. Three relics on one clock read as a single animated strip rather
 * than three loose objects, so each is offset in phase and runs at a slightly different
 * rate — while all three still scale from the one period the viewer tunes.
 */
export function relicFloatClock(index: number): CSSProperties {
  return {
    '--relic-float-delay': `${index * -1.9}s`,
    '--relic-float-spread': `${1 + index * 0.13}`,
  } as CSSProperties;
}
