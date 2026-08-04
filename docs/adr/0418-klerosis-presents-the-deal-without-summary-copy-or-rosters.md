---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s Deploying and Unavailable roster"
  - "[ADR-0416](0416-klerosis-is-a-dedicated-pre-battle-screen.md)'s resolved combat roster and explanatory heading"
refines:
  - "[ADR-0417](0417-klerosis-deals-from-the-chartulary.md)"
---

# ADR-0418: Klerosis presents the deal without summary copy or rosters

## Context

The dedicated Klerosis screen repeated its meaning above and below the dealt cards. A heading and
paragraph explained that the visible cards supplied combat, while a large Deploying/Unavailable
box translated the same resolved deal into a second unit inventory. The card faces are already the
authored records being dealt, and the motion from the Chartulary establishes what is happening.

## Decision

- The Klerosis workspace presents its small **Klerosis** phase label, the dealt card faces, and
  **Confirm**. It does not add “Your deployment deal,” explanatory prose, or a secondary
  Deploying/Unavailable roster.
- Capacity and unavailable-unit truth remain persisted in the Deployment document and available
  to diagnostics and later placement behavior. Removing the duplicate presentation does not
  change admission, card divisibility, deal order, or placement.
- The card faces and their Chartulary-to-seat movement are the player-facing explanation of the
  deal. Klerosis does not restate their contents as another framed list.

## Consequences

- The deal remains visually focused on the cards the player is acknowledging.
- Units on undrawn or capacity-rejected cards are not enumerated on this confirmation screen.
- The Deployment Lab and Enchiridion can carry detailed operational explanation without turning
  the ordinary Run flow into a diagnostic surface.

