---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)'s magenta-edge and dark-violet-glow palette"
refines:
  - "[ADR-0427](0427-run-unit-controls-are-keyboard-and-touch-operable.md)"
  - "[ADR-0485](0485-expunctio-unit-pointer-targets-include-the-visible-outline.md)"
  - "[ADR-0487](0487-expunctio-selection-swaps-content-within-persistent-seats.md)"
---

# ADR-0488: Expunctio unit selection uses one blue mark

## Context

Expunctio used a cyan silhouette glow while the pointer was over a figure, then replaced it with
a magenta edge and violet glow after selection. Previous/Next entered the selected state directly,
so the control appeared to produce a different highlight even though direct figure activation and
cycling already selected the same stable unit identity.

The blue treatment is the clearer and more coherent cue for this card face. Input method should
not invent a second visual meaning for the same selected-unit state.

## Decision

- Pointer hover previews one stationary blue silhouette mark around the pointer-resolved unit.
- Direct figure activation and Previous/Next both commit the same selected-unit state and retain
  that same blue mark after the pointer leaves.
- Expunctio has no mouse-only, keyboard-only, cycle-only, magenta, or violet selection treatment.
- The shared mark changes only the sprite filter. It never moves, scales, or enlarges the unit or
  changes its semantic-button seat.

## Consequences

- A highlight means the same thing regardless of whether the player clicked the unit or cycled to
  it with the control.
- Hover remains a reversible preview; selection makes the identical blue mark persistent.
- The card keeps the stable physical geometry required by ADR-0487.

## More Information

- [Explicit Expunctio unit selection](0483-expunctio-unit-selection-is-explicit.md)
- [Visible-outline pointer targets](0485-expunctio-unit-pointer-targets-include-the-visible-outline.md)
- [Persistent Expunctio seats](0487-expunctio-selection-swaps-content-within-persistent-seats.md)
