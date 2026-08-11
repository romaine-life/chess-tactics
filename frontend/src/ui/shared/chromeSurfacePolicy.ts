import type { CSSProperties } from 'react';

/**
 * Installed fill for terminal chrome: controls and identity plates that end,
 * rather than establish, a containment level (ADR-0433).
 */
export const CHROME_LEAF_FILL_SURFACE = 'hybrid-wood-oak';

/**
 * A repeated leaf collection phases its wood by the item's own place in the data the
 * renderer is walking, so a row of identical controls is cut from one plank run instead
 * of stamping the same grain N times (ADR-0433). Deriving the offset from DOM position
 * instead is forbidden by ADR-0063 — pass the index the data already has.
 */
export function leafSurfacePhase(index: number): CSSProperties {
  return { ['--chrome-leaf-surface-index' as string]: index } as CSSProperties;
}

/**
 * The role whose installed marble a STRUCTURAL box borrows under its own inner frame:
 * a surface that establishes a region for subordinate units instead of ending the
 * interaction tree (ADR-0433). Paired with the leaf surface above, these two names are
 * the whole material hierarchy — a box wears the marble, every trigger inside it wears
 * the oak.
 */
export const CHROME_STRUCTURAL_FILL_ROLE = 'outer' as const;
