---
status: superseded
date: 2026-08-06
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0497](0497-rarity-colors-the-standard-artwork-frame.md)"
supersedes:
  - "[ADR-0495](0495-rarity-colors-the-standard-frame-metalwork.md)"
---

# ADR-0496: Rarity colors the complete Standard frame

## Context

ADR-0495 kept the Standard card's brown wood while recoloring only its metalwork. After
reviewing that treatment in live cards, the owner returned to the earlier comparison study and
selected its complete light-blue and gold treatments. At card size, the stronger whole-frame
color reads as rarity immediately; preserving brown wood weakens that hierarchy more than it
helps the three cards read as one physical object.

Rarity remains independent from frame type. This decision changes only how the Standard
family's Uncommon and Rare members are painted.

## Decision

The Standard frame family keeps its three semantic rarity slots:

- Common: `ui/run/card-prototypes/frame-v1.png`, the original accepted frame.
- Uncommon: `ui/run/card-prototypes/standard-uncommon-frame-v1.png`, the complete light-blue
  structural frame.
- Rare: `ui/run/card-prototypes/standard-rare-frame-v1.png`, the complete gold structural
  frame.

“Complete structural frame” includes the perimeter, the former wood structure, every bezel,
divider rail, fastener, and trim. It excludes the shared title, illustration, type, ledger, and
coin openings and all live face content. Geometry and the accepted Standard alpha silhouette
remain unchanged.

The selected rasters remain native 1060×1484 PNGs. The earlier generated RGB is combined only
with the accepted Standard alpha channel, without spatial resampling. Promotion requires the
version-2 typed Card Layout proof identifying the exact candidate, semantic slot, native scale,
and the owner's complete-frame review. Existing accepted pointers remain untouched until that
side-by-side review is complete.

A future ability-owned frame type still requires its own complete Common/Uncommon/Rare triplet;
rarity never substitutes a frame from another family. Rarity assignment, offer distribution,
prices, and gameplay strength do not change.

## Consequences

- Uncommon and Rare are legible from the whole card silhouette at market scale.
- The three Standard rarities share anatomy and openings, but no longer pretend to share one
  wood material.
- Card properties and future frame types remain orthogonal to rarity.
- Candidate review can compare the new full-color pair against the currently accepted pair
  before any runtime pointer moves.

## More Information

- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [ADR-0495](0495-rarity-colors-the-standard-frame-metalwork.md)
- [Runtime asset contract](../runtime-asset-contract.md)
