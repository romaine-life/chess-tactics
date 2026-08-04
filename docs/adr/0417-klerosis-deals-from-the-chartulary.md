---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s face-down deal into the Controls stack"
refines:
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)"
  - "[ADR-0416](0416-klerosis-is-a-dedicated-pre-battle-screen.md)"
---

# ADR-0417: Klerosis deals from the Chartulary

## Context

The dedicated Klerosis workspace animated each card from a guessed point near the top of the
workspace. That point had no game meaning. The Run already exposes the Chartulary through a
persistent title shortcut, and ADR-0387 established that shortcut as the real measured endpoint
for cards entering the held-card register.

## Decision

- Klerosis deals every card from the real, rendered Chartulary title shortcut. It does not own a
  second deck mark, a copied coordinate, or a workspace-relative approximation.
- The same `data-run-card-flight-target` endpoint used by Adlectio is measured in reverse. Each
  canonical `RunCard` face begins minimized inside that mark, follows one straight centre-to-centre
  segment, and grows into its final dealt seat in exact deal order.
- Dealt faces travel through the director-owned scene-continuity layer. The Controls rail and the
  Klerosis workspace keep their clipping authority; the animation does not escape it with a local
  portal or by weakening overflow rules.
- The settled card seats remain hidden while their travelling faces own the presentation. Confirm
  remains unavailable until the complete ordered deal lands. If the canonical shortcut,
  continuity host, geometry, or motion API cannot be measured, Klerosis reveals the resolved deal
  immediately rather than blocking gameplay.
- The transfer uses the existing functional card-transfer duration and easing tokens. It is a
  statement of card movement, not decorative motion, so reduced-motion handling follows the same
  functional-transfer policy as Adlectio.

## Consequences

- The visible deal now explains that combat cards came from the player's Chartulary.
- Chartulary identity cannot drift between acquisition, inspection, and Klerosis: all three use
  the same registered title mark.
- More-than-three-card future deals keep the same origin and ordered stagger while the destination
  grid remains free to wrap and scroll.
