/**
 * Installed fill for terminal chrome: controls and identity plates that end,
 * rather than establish, a containment level (ADR-0433).
 */
export const CHROME_LEAF_FILL_SURFACE = 'hybrid-wood-oak';

/**
 * The role whose installed marble a STRUCTURAL box borrows under its own inner frame:
 * a surface that establishes a region for subordinate units instead of ending the
 * interaction tree (ADR-0433). Paired with the leaf surface above, these two names are
 * the whole material hierarchy — a box wears the marble, every trigger inside it wears
 * the oak.
 */
export const CHROME_STRUCTURAL_FILL_ROLE = 'outer' as const;
