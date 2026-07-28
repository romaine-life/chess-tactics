---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0183](0183-cyan-footprint-fitting-is-viewport-level-and-edits-points-or-edges.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0179](0179-predrawn-cyan-move-highlights-use-per-cell-visual-footprints.md)"
---

# ADR-0182: Cyan footprint editing has image-axis locks and native-pixel nudges

## Context

The cyan move-footprint editor needs to fit small irregularities in generated
art precisely. Free two-axis dragging makes it too easy to disturb a coordinate
that is already correct, while normalized profile coordinates do not give the
owner an intuitive smallest adjustment. The persisted
`cell-diamond-10000-v1` basis remains the correct portable representation and
must not become dependent on one browser's displayed zoom.

## Decision

### Axis lock is explicit image-axis tool state

The editor exposes **Free**, **X only**, and **Y only** axis modes. X and Y mean
the artwork's horizontal and vertical image axes, not the board's projected
diagonal axes. The current mode applies to pointer drags, keyboard arrows, and
the visible nudge buttons.

A constrained drag captures its mode and starting handle coordinate at pointer
down. X-only movement preserves the starting Y coordinate exactly and clamps X
to the admissible interval inside the canonical diamond at that Y. Y-only
movement preserves X exactly and clamps Y in the same way. A nudge on the
disallowed axis is unavailable and performs no edit. Axis mode and active-handle
selection are session-local tool state; neither is profile data nor an Undo
step.

### Nudge distance follows the native artwork raster

The editor exposes four plainly visible direction buttons for the selected
handle. One button press or unmodified Arrow key moves the handle by one pixel
of the exact artwork raster being fitted. Shift+Arrow moves ten native artwork
pixels.

The editor deterministically converts a requested raster-pixel delta through
the surface's exact `worldBounds` and `frameWidth`/`frameHeight`, then through
the canonical 96-by-54 cell bounds into `cell-diamond-10000-v1`. The resulting
normalized coordinate delta is rounded once to the nearest integer, with a
nonzero pixel request always yielding at least one normalized unit. This keeps
the existing profile schema and accepts only its sub-pixel quantization error;
it does not introduce a second pixel-coordinate profile.

Every horizontal nudge preserves Y exactly, and every vertical nudge preserves
X exactly, even while the visible axis mode is Free. Diamond containment may
shorten the requested movement along its chosen axis, but it may not move the
other coordinate.

### Precision edits use the existing reversible history

One successful button press or keyboard nudge is one existing session-local Undo
step. One completed constrained drag remains one step. A rejected or clamped
no-op creates no history entry. A canceled pointer drag restores its starting
profile and creates no entry. Axis changes and active-handle selection do not
enter history.

## Consequences

- The owner can preserve an already-correct image coordinate while correcting
  the other one.
- One-pixel controls have stable meaning at every editor zoom level.
- Saved Levels and attempt drafts retain the existing normalized profile schema
  and exact snapshot behavior.
- The precision controls occupy their own compact toolbar rather than crowding
  the primary editor navigation.

## Verification

Contract-complete implementation proves that:

- X-only and Y-only movement preserve the locked coordinate at ordinary and
  diamond-boundary positions;
- Free movement still accepts both coordinates;
- native-pixel conversion uses exact raster and world dimensions and rounds the
  complete requested delta only once;
- button and keyboard nudges respect the axis lock and each successful action is
  independently undoable; and
- the running full-workspace editor visibly exposes the three modes and four
  one-pixel direction controls without reducing the image workspace to a card.
