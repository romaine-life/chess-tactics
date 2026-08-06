---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0388](0388-remaining-shop-cards-settle-into-their-new-seats.md)"
partially_supersedes:
  - "[ADR-0431](0431-sectio-transactions-never-wait-for-presentation.md)'s survivor-FLIP clauses"
refines:
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)"
  - "[ADR-0420](0420-the-fivefold-gambit-codex-is-the-default-run-card-back.md)"
---

# ADR-0481: Sectio offers reveal the face-down pile beneath them

## Context

Adlectio sent the selected card face to the Chartulary, removed its offer seat, and used a
measured FLIP to recenter every surviving offer. That motion preserved spatial continuity, but
the layout still described three independent cards that disappeared one by one. It did not make
the deal feel like physical piles or leave any visible trace in the seat from which a card came.

The Run already has one accepted universal card back and one shared `RunCardBack` renderer.
Deployment uses it to conceal real persisted cards, but Sectio had no shared physical-pile object
that could place that back beneath an offered face.

## Decision

- Every original Sectio offer seat is one canonical `RunCardPile`: the offered `RunCard` face is
  registered directly over one accepted universal `RunCardBack` in the same grid area.
- Adlectio still commits immediately and launches the selected canonical face toward the measured
  Chartulary destination. The committed Sectio replaces only that pile's face with its revealed
  back. The pile and every other original seat remain in place for the rest of the visit; Reset
  restores the same offer faces over those backs.
- The revealed back is non-interactive presentation. It is not a replacement offer, a draw action,
  a persisted remainder count, or evidence that another gameplay card exists below the acquired
  one. Future pile mechanics require their own model and decision rather than inferring state from
  this placeholder.
- Surviving offer faces remain stationary, affordable faces remain clickable, and independent
  Adlectio flights may coexist exactly as ADR-0431 requires. Because the original seat inventory
  no longer changes, the survivor FLIP and its measurement, interruption, and motion code are
  retired.
- Plain and installed-wrap Sectio layouts count all original offer piles, including revealed
  backs. A fully adlected deal retains those backs and the accessible completion status instead of
  collapsing to an empty row.
- `RunCardPile` owns the face-over-back composition. Sectio resolves the accepted
  `ui/run/card-back/standard.png` live-media slot and supplies it to that shared object; it does not
  create new pixels, a local back, or a packaged fallback.

## Consequences

- Removing a card now reveals that it came from a physical pile while preserving its exact source
  seat.
- Rapid Adlectio is calmer: only selected faces move, while the other decisions stay under the
  pointer instead of changing position.
- The presentation provides a natural visual hook for later pile functionality without silently
  committing the Run model to a draw, refill, or stock-count rule today.
- ADR-0388's re-centering contract and FLIP implementation are retired rather than retained as an
  unused compatibility path.

## More Information

- [Game concept](../game-concept.md)
- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
