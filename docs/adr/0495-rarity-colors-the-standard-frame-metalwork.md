---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s white/steel rarity-to-frame mapping"
---

# ADR-0495: Rarity colors the Standard frame's metalwork

## Context

ADR-0493 makes rarity an explicit card fact, but its provisional visual mapping borrows the
white Concinnous and forged-steel Hieratic frames. That makes rarity indistinguishable from a
future card property that may itself need to change frame type. It also replaces the ordinary
card's wood identity exactly where the owner wants a stronger pull reaction.

The owner reviewed Common plus silver, light-blue, dark-blue, and gold treatments in the shared
Card Layout face. Both artwork-bezel-only and whole-frame treatments were compared. Treatments
that replaced the wood made the card stop reading as the same physical object. The selected
Uncommon treatment is light-blue metalwork with the Standard wood preserved; Rare uses the
matching gold treatment.

## Decision

Rarity and frame type are independent card facts. The Standard frame family owns three semantic
rarity slots:

- Common: `ui/run/card-prototypes/frame-v1.png`, the accepted dark-metal and wood frame.
- Uncommon: `ui/run/card-prototypes/standard-uncommon-frame-v1.png`, light-blue metalwork.
- Rare: `ui/run/card-prototypes/standard-rare-frame-v1.png`, antique-gold metalwork.

Uncommon and Rare recolor only the Standard frame's existing metal system: perimeter bands,
art bezel, fasteners, and thin trim. Brown wood, visible grain, carved joints, geometry, openings,
coin, illustration, and live face content remain the Standard design. “Whole frame” therefore
means all existing metalwork, never all card material.

The runtime resolves rarity inside the selected frame family. If abilities later introduce a
new frame type, that type must provide a complete Common/Uncommon/Rare triplet before it can be
used with rarity; rarity must not silently substitute another frame family.

Both new rasters remain live-storage-backed native 1060×1484 PNGs. Promotion requires the typed
Card Layout proof that identifies the exact candidate bytes, native scale, semantic rarity slot,
and the owner's wood-preservation review. This decision does not change ADR-0493's rarity
assignment, inventory, tier-first offer rates, or gameplay strength model.

## Consequences

- A player can learn rarity from a stable light-blue/gold material ladder without confusing it
  with a card ability or property.
- Common, Uncommon, and Rare remain recognizably the same wooden card object.
- Adding a future ability-owned frame costs a deliberate three-rarity visual set; incomplete
  frame families cannot leak into live play.
- Rarity can produce a pull reaction while card illustration, formation, and eventual abilities
  still carry the card's individual interest.

## More Information

- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [UI art direction](../ui-art-direction.md)
