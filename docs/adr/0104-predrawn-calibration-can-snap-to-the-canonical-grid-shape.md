---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
---

# ADR-0104: Pre-drawn calibration can snap to the canonical grid shape

## Context

Owner-configurable refit dimensions and free corner placement can describe the
grid a candidate actually painted, but they do not provide a direct view of what
that same row/column count would look like at the game's accepted projection.
The owner needs to experiment with counts such as 6×10 while comparing against
the exact final cell angles, cell aspect, and equal spacing.

## Decision

The pre-drawn calibration instrument provides a **Snap ideal grid** action. It
uses the currently selected refit row and column counts and replaces the four
outer corners with the closest grid having the canonical board projection:
column steps follow `(TILE_STEP_X, TILE_STEP_Y)`, row steps follow
`(-TILE_STEP_X, TILE_STEP_Y)`, and every cell uses one shared scale.

The snap preserves the current grid's center and best-fit overall scale whenever
the resulting shape fits the source image. It translates or uniformly shrinks
only as needed to remain inside the source bounds. It also resets internal row
and column guides to equal spacing, because unequal guides would contradict the
ideal-grid comparison.

The selected refit counts do not change. The action changes pending calibration
only and requires the existing explicit save. Authored level dimensions,
playable cells, and gameplay remain untouched.

## Consequences

- The owner can switch among candidate grid counts and immediately compare each
  against the exact geometry an accepted plate must match.
- The snap is deterministic and uses the same projection constants as runtime
  board geometry rather than a visually estimated angle.
- Free corner and guide editing remain available after the snap, and restoring
  the opening calibration remains the escape hatch.
