---
status: superseded
date: 2026-08-05
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0508](0508-alienatio-leaves-the-authored-formation-seat-vacant.md)"
  - "[ADR-0511](0511-held-cards-are-immutable-formations.md)"
refines:
  - "[ADR-0421](0421-scene-activity-owns-imperative-motion.md)"
  - "[ADR-0431](0431-sectio-transactions-never-wait-for-presentation.md)"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)"
  - "[ADR-0487](0487-expunctio-selection-swaps-content-within-persistent-seats.md)"
---

# ADR-0489: Alienatio fades the departure and flips the next card frame

## Context

Alienatio already committed immediately, but its card face snapped from the pre-sale unit stack
to the persisted post-sale projection. A selected figure simply disappeared and an identical
survivor could jump into another occurrence's seat. That abrupt replacement hid the causal
relationship between the command, the departing unit, and the card's new contents.

Selection itself must remain the stationary in-place state established by ADR-0487. A completed
sale is different: it is an actual model transition and should visibly carry the old physical
arrangement into the exact next frame.

## Decision

- A valid Aliene command commits its gameplay and persistence state immediately. Presentation
  never disables Expunctio, delays the transaction, or becomes transaction authority.
- Before committing, Expunctio captures the selected unit image and every stable surviving unit
  identity's current visual rectangle.
- The sold image is copied into the director-owned continuity layer over its old pixels and fades
  away. The committed card face is the only live interactive face throughout the transition.
- Expunctio composes its exact post-sale frame by packing occupied unit occurrences into the
  canonical visible stack. Other card hosts continue to retain authored empty-seat geometry.
- Each surviving real unit uses FLIP geometry to glide from its captured visual rectangle into
  its committed DOM seat. The live element owns the destination; no unit moves or enlarges merely
  because it was selected.
- Imperative survivor motion goes through `SceneActivity`, reads the shared fade duration and
  standard easing tokens, and skips presentation if motion is unavailable. The departure is an
  inert opacity-only continuity visual with a bounded cleanup watchdog.
- A new sale may interrupt an earlier reflow. Its source measurement is the survivor's current
  visual rectangle, so the next transition continues from the pixels the player actually saw.

## Consequences

- The player can see which figure was sold and how the card became its next stable arrangement.
- Identical units preserve causal continuity through stable Run unit identities instead of
  relying on their authored occurrence numbers.
- Input remains available during the visual settlement, and missing or reduced motion changes
  only presentation, never the result of Alienatio.
- The persistent companion seats still do not jolt when selecting or cycling a unit; only a
  completed transaction moves the affected card figures.

## More Information

- [Card-aware Alienatio](0482-expunctio-owns-card-aware-alienatio.md)
- [Persistent Expunctio seats](0487-expunctio-selection-swaps-content-within-persistent-seats.md)
- [Immediate Sectio transactions](0431-sectio-transactions-never-wait-for-presentation.md)
