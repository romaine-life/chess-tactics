---
status: superseded
date: 2026-08-06
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0510](0510-held-cards-are-immutable-formations.md)"
supersedes:
  - "[ADR-0489](0489-alienatio-fades-the-departure-and-flips-the-next-card-frame.md)'s compact post-sale frame and survivor FLIP"
refines:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0427](0427-deployment-cards-retain-their-authored-seat-geometry.md)"
  - "[ADR-0487](0487-expunctio-selection-swaps-content-within-persistent-seats.md)"
---

# ADR-0508: Alienatio leaves the authored formation seat vacant

## Context

ADR-0489 was written when a Run card presented same-role units as a compact stack. Removing one
unit changed that stack's composition, so the card deliberately packed its survivors and animated
them into their new positions.

Run cards now present authored deployment formations on miniature board grids. Each persisted
`unitSeats` index is validated against the same-index card piece and formation cell. Compacting
survivors after Alienatio therefore no longer preserves a neutral list layout: it makes a unit
appear to change formation cells and misstates the card's durable geometry. The obsolete compact
prop was removed from the canonical face when formations arrived, but Expunctio's survivor
measurement and type-grouped projection remained.

The sold figure's fade still provides useful causal continuity. That departure does not require
any surviving figure to move.

## Decision

- A valid Aliene command still commits gameplay and persistence immediately.
- Before committing, Expunctio captures the selected formation sprite over its exact current
  pixels. That inert copy fades through the director-owned continuity layer after the live sprite
  leaves.
- `RunOwnedCard.unitSeats[i]` projects only to card piece `i` and its authored formation cell `i`.
  A null seat is a visible vacancy at that same cell. Units are never regrouped into the earliest
  same-type occurrence for presentation.
- Every card-aware host uses that indexed projection. Alienatio, combat loss, and Deployment
  progress remove the affected sprite without changing any survivor's cell, size, or identity.
- Expunctio does not capture survivor rectangles, run a FLIP reflow, or opt into a compact
  post-sale face. Selection and cycling remain stationary as before.
- The departure fade remains presentation-only, never delays the transaction, never disables
  input, and may be skipped when its source pixels or continuity surface are unavailable.

## Consequences

- Alienatio reads as subtraction from a persistent formation: one figure fades and its square is
  left empty.
- Repeated same-type units remain distinguishable by stable Run identity and authored cell rather
  than visibly closing ranks after one leaves.
- Deployment and Expunctio agree on the exact vacancy because both use the same direct indexed
  projection.
- No Run-save or database migration is required. The current backend already validates each
  occupied seat's unit type against the same-index card piece.

## More Information

- [Immutable held formations](0510-held-cards-are-immutable-formations.md)
- [Persistent Deployment seats](0427-deployment-cards-retain-their-authored-seat-geometry.md)
- [Card-aware Alienatio](0482-expunctio-owns-card-aware-alienatio.md)
- [Persistent Expunctio controls](0487-expunctio-selection-swaps-content-within-persistent-seats.md)
