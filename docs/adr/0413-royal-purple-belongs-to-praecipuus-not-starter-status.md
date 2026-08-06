---
status: superseded by ADR-0492
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s shared royal-purple starter frame"
refines:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)"
refined_by:
  - "[ADR-0414](0414-selected-starter-card-media-becomes-dedicated-runtime-identity.md)'s exact accepted frame and art cutover"
---

# ADR-0413: Royal purple belongs to Praecipuus, not starter status

## Context

His Grace and Front Lines were introduced together as starter-only cards and initially shared one
royal-purple frame. That made the two ordinary starting Pawns look as though their card carried the
same regal authority as Praecipuus even though Front Lines has no card property and grants no unit
ability.

The card frame is already selected by the canonical card-property resolver. Starter membership
does not need a second visual rule beside that semantic path.

## Decision

- Royal purple identifies **Praecipuus**. His Grace keeps the owner-selected Codex royal-purple
  frame and Codex illustration.
- Front Lines remains a starter-only named card with its dedicated illustration, but its lack of a
  card property resolves the ordinary Standard Units frame everywhere.
- The shared card-face frame resolver owns the distinction. Card Layout offers royal-frame review
  candidates only while His Grace is active; switching to Front Lines clears and ignores a stale
  starter-frame candidate address.
- This visual change does not alter the starter deck, units, pricing, removability, Klerosis,
  persistence schema, or database. No migration is required.

## Consequences

Purple communicates the King's exceptional authority instead of merely indicating that a card was
present at Run creation. Front Lines reads as exactly what it contains: ordinary soldiers on an
ordinary card, with its starter identity carried by its authored name and illustration.

## More Information

- [Game concept](../game-concept.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)
- [ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)
