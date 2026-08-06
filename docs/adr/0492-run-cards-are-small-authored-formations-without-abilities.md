---
status: superseded by ADR-0493
date: 2026-08-06
deciders: owner (Nelson) + Codex
superseded_by: 0493-generated-run-formations-fall-sideways-and-own-rarity.md
supersedes:
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)"
  - "[ADR-0271](0271-core-cards-become-affected-when-drawn.md)"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)"
  - "[ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)"
  - "[ADR-0310](0310-concinnous-offers-use-a-seeded-one-in-eight-eligible-roll.md)"
  - "[ADR-0311](0311-pestiferous-cards-reveal-one-plagued-unit-at-a-time.md)"
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)"
  - "[ADR-0345](0345-hieratic-draws-one-in-eight-and-grants-agminate-at-acquisition.md)"
  - "[ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)"
  - "[ADR-0395](0395-eutactic-bestows-only-front-or-back-row-arrangement.md)"
  - "[ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)"
  - "[ADR-0397](0397-cacochymic-dies-at-combat-end-while-pestiferous-retargets.md)"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)"
  - "[ADR-0413](0413-royal-purple-belongs-to-praecipuus-not-starter-status.md)"
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s one-unit-at-a-time placement"
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)'s one-unit-at-a-time transport"
---

# ADR-0492: Run cards are small authored formations without abilities

## Context

The Run had accumulated four card qualifiers, four unit states, acquisition targeting,
piece-specific fuzzy placement preferences, placement relics, and a forty-nine-composition
deck. Those systems made an early Run ask the player to interpret more vocabulary than the
economy and combat loop had earned. The project has not yet completed a full Run, so protecting
that first completion is more valuable than preserving speculative breadth.

Cards still need a concrete tactical identity. Pure material bundles say little beyond their
price, while ordered micro-formations say exactly how a purchase enters the board and remain
legible on the physical card face.

## Decision

The active offer deck contains nineteen authored cards of one, two, or three units. Each card
persists ordered piece seats and a parallel set of board-relative offsets; `y = 0` is the edge
toward the enemy. Composition does not generate cards. Similar compositions may coexist only
when their shapes are meaningfully different, such as protected and reversed Pawn triangles or
diagonal and vertical Bishop pairs.

The starter Chartulary contains one non-removable card, **His Grace**, with the King behind two
Pawns. The separate **Front Lines** starter is retired. All active cards use the Standard frame,
and existing accepted art may be reused until dedicated formation illustrations are authored.
Rarity is tabled.

Cards, offers, and units carry no qualifier, ability, state, target, or effect-seed fields.
Pestiferous, Concinnous, Legatine, Hieratic, Cacochymic, Adlected, Eutactic, Agminate, and relics
whose only purpose is granting those states are removed from active play and reference routes.
Ataraxia exposes only tier 0. The remaining lipsana affect direct economy or concrete Battle
systems and never require a unit target when taken.

Deployment deals cards in seeded combat order, with His Grace first. Playing a card plans and
commits every remaining unit on that card as one atomic formation. The planner tries legal
translations of the complete authored shape. If none fits, it deterministically tries legal
individual squares; capacity may then block what remains. The plan, committed placements, and
arrival wave persist. There is no per-unit placement choice.

Run save version 24 migrates predecessor saves by stripping retired unit and card fields,
filtering retired lipsana, rebuilding the starter, preserving already-active formation cards,
and converting unrecognized bundles into plain single-unit cards. A Run already in Deployment
or Battle returns to Deployment so its placement plan is derived under the new rules.

## Consequences

- The first Run teaches cards, material, Sectio purchases, and visible formations without a
  second glossary of powers.
- A card's face directly predicts its board result.
- The bounded catalog can grow by deliberate shape authorship rather than combinatorics.
- Some shapes may be weak or awkward; that is acceptable while economy balance is the primary
  learning objective.
- Unplaceable-shape recovery is intentionally utilitarian and can be revisited after complete
  Runs provide evidence.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0346](0346-run-state-crafting-composes-real-transitions.md)
- [ADR-0435](0435-full-deploy-commits-one-wave-without-reveal.md)
