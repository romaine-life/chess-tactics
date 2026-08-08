---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s mandatory sideways automatic placement"
  - "[ADR-0509](0509-run-formations-summon-off-board-before-sliding.md)'s universal formation-arrival choreography"
refines:
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)"
---

# ADR-0512: Run creation selects automatic or arranged formations

## Context

Sideways automatic Deployment gives the player unusual chess positions, but it also withholds
control after the player has deliberately bought exact formation cards. The deck already supplies
substantial uncertainty: only part of it is dealt, deal order is seeded, and the available shapes
are the imperfect result of earlier Sectio choices. Adding automatic placement on top can make the
placement phase look interactive without letting the player solve its most interesting problem.

The alternative is not yet proven strongly enough to delete automatic Deployment. It should be a
real playable Run rule, not a temporary client preference, so both approaches can survive reload,
account resume, and direct testing without silently changing an active Run.

## Decision

- Every Run owns one immutable `deploymentMode`: **Arrange formations** or **Automatic
  formations**. Run preparation selects it beside Ataraxia. New preparation initially selects
  Arrange formations; the player may explicitly choose Automatic formations before Start Run.
- Existing version-28 Runs migrate to Automatic formations. Their established Deployment and
  Battle positions remain truthful. RunSaveVersion advances to 29 and append-only migration 68
  adds the same explicit value to account-owned Runs.
- Automatic formations retain the current seeded deal order, reveal/transport controls,
  right-to-left rigid settling, deterministic individual fallback, and arrival choreography.
- Arrange formations retains the same seeded combat deal, but completing Deal turns every dealt
  card face up at once. A complete card may be selected in any order, quarter-turned without
  reflection, and translated anywhere its complete surviving formation fits inside the authored
  two-row player Deployment band. Piece-specific zone eligibility, terrain, props, authored
  occupancy, and already arranged formations remain hard collisions.
- An arranged card commits all of its admitted units atomically. Selecting a placed card permits
  removing and replacing it before Battle, so there is no gold-priced pre-Battle undo. Rotation
  and placement are player choices, not new card identities and not persisted card mutations.
- Capacity admission remains deterministic and card ordered, but never divides a formation: dealt
  cards are admitted as a prefix while each complete next card fits the remaining numeric capacity.
  Later cards and all undealt cards remain unavailable for that Battle.
- **Begin Battle** is an explicit arrangement boundary. His Grace's King must be placed. Any other
  admitted formation left off the board is recorded as blocked for that Battle; this prevents an
  impossible packing from trapping the Run and makes the omission visible rather than silently
  breaking the shape.
- A five-gold Battle-position reroll remains available in either mode. In Arrange formations it
  returns to the visible-hand arrangement boundary with every placement cleared. The one-gold
  pre-Battle position reroll is absent because removal and replacement are already free.
- Arrangement selection and hover are presentation state. Persisted Run state owns the mode,
  admitted units, visible dealt cards, exact committed placements, per-card plans, and the
  arrangement boundary; reload never changes a placed formation.

## Consequences

- The player can evaluate whether deliberate army construction supplies enough variety without
  removing the already playable automatic system.
- Exact formation cards become spatial tools the player actively fits together, while deck
  composition and combat draw still prevent a rehearsed opening from being guaranteed.
- Run preparation gains one consequential rule choice. It is deliberately named by what the
  player does rather than by prototype terminology such as “manual” or “full control.”
- A player may bench a non-royal formation for one Battle. That is a visible, self-penalizing
  recovery rule and should be evaluated with the rest of the placement prototype.
- Automatic-only transport and summon/slide presentation remain isolated to the automatic mode;
  they are not compatibility fallbacks for arranged Runs.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
