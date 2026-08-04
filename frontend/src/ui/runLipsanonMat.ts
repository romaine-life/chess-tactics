import { liveMediaForSlot } from '@chess-tactics/board-render';
import type { CSSProperties } from 'react';

/**
 * The surface the Conflict's lipsana are laid out on. Its own runtime slot rather than a
 * workspace background: a workspace background covers the whole screen, and this is one
 * object sitting on it, sized against the lipsana rather than against the viewport.
 *
 * Decorative — an unaccepted slot leaves the lipsana on the backdrop alone rather than
 * throwing the screen away.
 */
export const LIPSANON_MAT_SLOT = 'ui/run/bona-vacantia/mat.png';

export function installedLipsanonMatUrl(): string | null {
  try {
    return liveMediaForSlot(LIPSANON_MAT_SLOT).media?.immutableUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * What the lipsana' idle motion and light SHIP as. style.css carries these same numbers as
 * the custom-property fallbacks, and the Studio's Lipsanon Mat viewer resets to them — a reset
 * returns to the committed value, never to zero or to a slider's floor (ADR-0057).
 */
export const LIPSANON_FLOAT_COMMITTED_RISE = 5;
export const LIPSANON_FLOAT_COMMITTED_PERIOD = 3.4;
export const LIPSANON_GLOW_COMMITTED = 1;
/** The stroke that seats the tray on the table, in whole pixels. */
export const LIPSANON_TRAY_STROKE_COMMITTED = 1;
/**
 * How much of the untaken lipsana' exit is a shrink. 0 collapses them to a point as they go;
 * 1 leaves them at full size and only fades them. They vanish either way.
 */
export const LIPSANON_RECEDE_COMMITTED = 0;
/** `linear` interpolates the bob's stops into a float; `steps(1, end)` holds each one. */
export const LIPSANON_FLOAT_COMMITTED_TIMING = 'linear';
export const LIPSANON_FLOAT_STEPPED_TIMING = 'steps(1, end)';

/**
 * One offer's own clock. Three lipsana on one clock read as a single animated strip rather
 * than three loose objects, so each is offset in phase and runs at a slightly different
 * rate — while all three still scale from the one period the viewer tunes.
 */
export function lipsanonFloatClock(index: number): CSSProperties {
  return {
    '--lipsanon-float-delay': `${index * -1.9}s`,
    '--lipsanon-float-spread': `${1 + index * 0.13}`,
  } as CSSProperties;
}
