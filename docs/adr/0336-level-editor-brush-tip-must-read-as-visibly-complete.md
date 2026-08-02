---
status: superseded
date: 2026-08-01
deciders: owner (Nelson) + Codex
superseded-by: "[ADR-0337](0337-level-editor-brush-ships-the-exact-approved-option-01-pixels.md)"
refines:
  - "[ADR-0335](0335-level-editor-brush-option-01-sets-the-native-production-brief.md)"
---

# ADR-0336: Level Editor Brush tip must read as visibly complete

## Context

The first role-native Option 01 candidate satisfied its mechanical 18×18
contract: its opaque bounds were inset by one transparent pixel and no alpha
reached the frame edge. In the real Level Editor button, however, the broad
pale bristle mass ended in a hard upper-right block without an enclosing
contour. The owner rejected it because the brush head looked cut off and the
glyph no longer read reliably as a brush.

Mechanical frame clearance was therefore necessary but not sufficient. The
visual silhouette itself also needs closure at this footprint.

## Decision

- The rejected candidate remains private and cannot be reviewed or accepted as
  the production Brush icon.
- The complete pale bristle head must be enclosed by a visible one-pixel dark
  contour on every exposed side, including its upper-right tip.
- The tip must bevel or taper before its content boundary. Pale bristle pixels
  cannot terminate directly against transparency in a rectangular,
  canvas-aligned block that suggests clipping.
- The revised pass uses a centered generation mask no larger than 14×14 inside
  the exact 18×18 production crop. This preserves at least two transparent
  frame pixels beyond even a mask-filling silhouette while retaining the
  no-resampling handoff from ADR-0335.
- Alpha evidence remains a validation prerequisite, but owner review in the
  real Level Editor decides whether the silhouette actually reads as a
  complete paintbrush.

## Consequences

- A technically inset glyph can still fail review when its internal contour
  implies that the artwork continues beyond the frame.
- Subsequent Brush candidates must demonstrate both pixel clearance and visual
  closure; neither substitutes for the other.
