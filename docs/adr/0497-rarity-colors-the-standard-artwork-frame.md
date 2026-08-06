---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0496](0496-rarity-colors-the-complete-standard-frame.md)"
---

# ADR-0497: Rarity colors the Standard artwork frame

## Context

ADR-0496 interpreted “fully colored card frames” as recoloring the complete structural card
body. The resulting live-card review made the rarity treatment compete with the card itself.
The intended target was narrower: the physical frame immediately surrounding the illustration.
That area can announce rarity while every card still reads as the same familiar object.

Rarity remains independent from frame type. This decision changes only how the Standard
family's Uncommon and Rare members paint the illustration bezel.

## Decision

The Standard frame family keeps its three semantic rarity slots:

- Common: `ui/run/card-prototypes/frame-v1.png`, the original accepted frame.
- Uncommon: `ui/run/card-prototypes/standard-uncommon-frame-v1.png`, with a light-blue
  illustration bezel.
- Rare: `ui/run/card-prototypes/standard-rare-frame-v1.png`, with a gold illustration bezel.

The outer perimeter, wood body, dividers, fasteners, title opening, type opening, ledger
opening, and coin treatment remain the original Standard treatment at every rarity. Only the
bezel immediately around the illustration changes color. Geometry and the accepted Standard
alpha silhouette remain unchanged.

The selected rasters remain native 1060×1484 PNGs. Their generated RGB is combined only with
the accepted Standard alpha channel, without spatial resampling. Promotion requires the
version-3 typed Card Layout proof identifying the exact candidate, semantic slot, native
scale, and artwork-bezel-only treatment. Existing accepted pointers remain untouched until
the owner approves the side-by-side review.

A future ability-owned frame type still requires its own complete Common/Uncommon/Rare
triplet; rarity never substitutes a frame from another family. Rarity assignment, offer
distribution, prices, and gameplay strength do not change.

## Consequences

- Rarity is concentrated around the card's visual focal point instead of repainting the card.
- Common, Uncommon, and Rare retain one physical outer-card identity.
- Card properties and future frame types remain orthogonal to rarity.
- Candidate review compares exact light-blue and gold artwork-bezel bytes before either live
  pointer moves.

## More Information

- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [ADR-0496](0496-rarity-colors-the-complete-standard-frame.md)
- [Runtime asset contract](../runtime-asset-contract.md)
