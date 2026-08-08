---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0512](0512-run-creation-selects-automatic-or-arranged-formations.md)"
partially_supersedes:
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s orientation-specific card identities and automatic placement"
  - "[ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)'s 180-card rarity-quota pile"
  - "[ADR-0509](0509-run-formations-summon-off-board-before-sliding.md)'s automatic formation arrival"
refines:
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)"
---

# ADR-0515: Player arranges rotation-canonical cards from a complete shuffle

## Context

The card deck and combat draw already withhold enough information to create unfamiliar chess
positions. Automatic placement adds another random layer after the player has deliberately bought
spatial formations, while orientation-specific copies make the catalog repeat cards the player can
freely rotate into one another. Rarity distribution is still being designed and must not block a
playable placement loop.

## Decision

- Player arrangement is the sole Run Deployment rule. Run preparation and direct War play expose
  no mode selector. Completing the deal reveals every dealt card; the player may select cards in
  any order, rotate them by quarter turns without reflection, translate them to any legal location,
  remove and replace them freely, and explicitly begin Battle after placing His Grace.
- Automatic reveal transport, sideways settling, and its pre-Battle reroll are retired from the
  player flow. The five-gold Battle-position redo remains and returns to a cleared arrangement.
- Card identities that differ only by translation or a 0/90/180/270-degree rotation collapse to
  one live offer identity. Reflections remain distinct. Named authored cards anchor their matching
  rotational class. The live offer catalog is 272 cards, plus His Grace as the starter-only card.
- Historical card ids remain readable for held version-29 cards but are not part of the live offer
  deck or reference catalog.
- Sectio temporarily ignores rarity when dealing. One pile is a deterministic complete shuffle of
  all 272 live offer cards, with every identity appearing exactly once. Exhausting it creates a new
  independently seeded complete shuffle. Rarity metadata and presentation remain untouched for the
  separate rarity-design pass.
- RunSaveVersion advances to 30. Migration 69 changes every version-29 Run to arranged placement,
  restarts the hidden Sectio cursor because its sequence changed, and clears an in-progress
  Deployment to the deal boundary. A Battle already underway preserves its committed board.

## Consequences

- Purchasing a formation and placing it now describe the same spatial object; the player, rather
  than a hidden solver, decides how the formations fit.
- Rotation removes orientation-only catalog repetition without removing mirrored relationships.
- The market distribution is intentionally neutral for this iteration. A later rarity decision can
  replace the complete shuffle without reopening card identity or Deployment control.
- Existing held orientations remain playable during migration, but all future market cards come
  from the 272-card rotation-canonical catalog.

