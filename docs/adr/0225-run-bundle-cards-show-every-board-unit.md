---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0225: Run bundle cards show every board unit

## Context

ADR-0219 represented Run bundles with cropped unit portraits, collapsed repeated
piece types into quantity badges, and kept the exact board sprites out of the
card. The resulting cards did not read like the units the player deploys on the
board. The owner requested that shop cards show the units exactly as they are
drawn in play and allowed a compact grid when a bundle contains many units.

## Decision

- Opening-draft and shop bundle cards retain one shared whole-card action.
- The card renders the canonical installed player-side board sprite once for
  every unit in the bundle, using the same palette and default facing resolution
  as the board.
- Repeated units remain repeated sprites. Portrait crops and quantity badges no
  longer represent bundle contents.
- The unit formation scales within the existing card content area. Small
  bundles get larger sprites; larger bundles use a compact grid.
- ADR-0219's live gold icon, price, accessibility, chrome, and live-media
  decisions remain in force.

## Consequences

- Bundle contents visually match the army the player will deploy.
- The number of visible units is literal rather than encoded in a badge.
- Dense, low-value bundles use smaller board sprites, but stay inside the same
  card shell and remain identifiable as formations of chess units.
- This ADR supersedes only ADR-0219's portrait-and-quantity representation.
