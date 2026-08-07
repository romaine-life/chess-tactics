---
status: accepted
date: 2026-08-06
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0313](0313-enchiridion-filters-cards-and-previews-affected-types.md)'s two-filter inventory"
  - "[ADR-0364](0364-enchiridion-cards-is-a-terminal-gallery-with-no-fourth-column.md)'s Gold-and-Contains pinned filter inventory"
refines:
  - "[ADR-0371](0371-the-chartulary-is-the-held-half-of-the-cards-reference.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)"
---

# ADR-0510: Enchiridion Cards filters rarity on structural teal

## Context

Rarity became a first-class formation-card property after the Enchiridion Cards gallery was
given its Gold and Contains filters. The gallery exposes the complete catalog but cannot answer
the ordinary question “which cards are Rare?” even though the live faces already communicate
rarity through their artwork bezels.

The filter row also predates the material hierarchy established by ADR-0433. It groups terminal
dropdown triggers without painting their containing field as structural teal or their closed
controls as oak leaves.

## Decision

- The shared Cards-gallery filter row adds **Rarity** beside **Gold** and **Contains**. Its values
  are **All rarities**, **Common**, **Uncommon**, and **Rare**.
- Gold, contained unit, and rarity remain independent exact filters. Active filters intersect,
  and the live result count and empty state describe the complete intersection.
- The same shared row appears in both the complete Enchiridion catalog and the Run's held-card
  Chartulary; the two surfaces do not acquire lookalike local implementations.
- The filter row is one structural teal/blue-stone field. Its three closed dropdown triggers are
  terminal oak controls using the canonical leaf surface, with monotonically indexed texture
  phases. Open dropdown bodies remain structural fields because they contain option rows.
- Filter choices remain ephemeral view state. They do not change card identity, Run state,
  routes, rarity assignment, or the hidden Sectio pile.

## Consequences

- Players can inspect the catalog's rarity populations directly and combine rarity with economy
  or composition questions.
- Uncommon and Rare artwork has a reachable comparison surface as those pools are curated.
- Cards and the Chartulary extend the shared teal-container/oak-leaf hierarchy without adding
  media or a bespoke control primitive.

## More Information

- [Game concept](../game-concept.md)
- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
