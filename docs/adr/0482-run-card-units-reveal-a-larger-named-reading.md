---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0217](0217-run-relic-icons-use-immediate-styled-tooltips.md)"
  - "[ADR-0218](0218-new-ui-surface-paint-is-build-blocked.md)"
  - "[ADR-0225](0225-run-bundle-cards-show-every-board-unit.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
---

# ADR-0482: Run card units reveal a larger named reading

## Context

Run cards show their exact contained units as canonical Battle sprites, but the
smallest density steps make an individual silhouette difficult to inspect. Sectio
offers also represent units that have not yet been acquired, so they have chess roles
but do not yet own the persistent personal identities created by Adlectio.

The owner asked for pointing at a unit on a Sectio card to reveal that unit larger and
name it in prose.

## Decision

- Every occupied same-role unit stack in the canonical `RunCardFace` is the
  pointer-hover trigger for one immediate shared `Tooltip` reading. Its trigger spans
  the occupied sprites, so crossing between repeated units neither replaces nor moves
  the popup. Empty authored seats do not create a trigger.
- The reading renders the same canonical player-side Battle sprite at a materially
  larger, stable screen size and spells out its chess role as live text: Pawn, Knight,
  Bishop, Rook, Queen, or King.
- An offered unit is not assigned or shown a fabricated personal name. Persistent
  historical names continue to begin only when Adlectio creates the army unit.
- The popup uses the one fixed-position, registered-inner-chrome tooltip owner so the
  card's clipped Contents Box cannot cut it off. Unit-state marker tooltips remain
  separate explanations of those markers.
- The complete Sectio card remains one action. Unit readings are not nested buttons or
  independent keyboard stops; the card action's existing accessible name continues to
  spell out its complete composition.
- Because `RunCardFace` is the one shared renderer, the same occupied-seat reading is
  available wherever the canonical face is shown rather than branching Sectio into a
  second card anatomy.

## Consequences

- Dense cards remain compact while every pictured unit can be inspected at a useful
  size and identified without relying on silhouette knowledge.
- Repeated units share one stable truthful role reading, while later persistent identity
  remains attached to the acquired army unit rather than the offer artwork.
- The feature adds layout only around the existing shared tooltip surface and creates
  no new UI paint or card interaction model.

## More Information

- [UI art direction](../ui-art-direction.md)
- [UI kit standard](../ui-kit-standard.md)
- [Shared UI primitives](../shared-ui-primitives.md)
