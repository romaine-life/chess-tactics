---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0511](0511-held-cards-are-immutable-formations.md)'s removal of Expunctio unit selection"
supersedes:
  - "[ADR-0484](0484-expunctio-unit-pointers-follow-sprite-alpha.md)"
refines:
  - "[ADR-0427](0427-run-unit-controls-are-keyboard-and-touch-operable.md)"
  - "[ADR-0483](0483-expunctio-unit-selection-is-explicit.md)"
---

# ADR-0485: Expunctio unit pointer targets include the visible outline

## Context

ADR-0484 made pointer targeting follow exact opaque source pixels. Live use showed that this is
more exact than the presentation promises: the hover treatment draws an outline around the unit,
but the pointer can visibly enter that outline—and appear well over a small figure beneath the
cursor—before its hotspot reaches one exact opaque pixel. The result feels horizontally delayed
even though the source mask and rendered sprite are correctly aligned.

A rectangular seat would remove that delay but would again make large transparent corners act as
part of the unit. The installed alpha mask can instead retain the silhouette while admitting the
small painted outline the player reasonably treats as its edge.

## Decision

- Expunctio pointer hover and click use the installed sprite's alpha silhouette plus a small
  scale-relative halo around its visible pixels. Transparent seat corners beyond that halo remain
  inert.
- The halo is derived from the same cached source mask and sprite scale. It is not a separately
  authored polygon, persisted state, or enlarged visual unit.
- The card stack resolves every candidate against the pointer coordinate. If neighboring halos
  overlap, the unit whose visible source pixel is nearest wins; equal distances follow paint order.
- Rectangular semantic buttons remain the keyboard focus targets, and coordinate-free keyboard
  activation plus Previous/Next behavior remain unchanged.

## Consequences

- The pointer reacts when its hotspot reaches the visible outline instead of requiring penetration
  into a small unit's raw opaque pixels.
- The hit area still reads as the unit rather than its layout box, including on sparse cards with
  conspicuous transparent sprite padding.
- Dense stacks remain deterministic even when two comfortable silhouette targets touch.

## More Information

- [ADR-0483](0483-expunctio-unit-selection-is-explicit.md)
- [ADR-0484](0484-expunctio-unit-pointers-follow-sprite-alpha.md)
- [Shared UI primitives](../shared-ui-primitives.md)
