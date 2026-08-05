---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s per-card reveal and discard sequence for Deploy all"
partially_supersedes:
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)'s fastest-pace interpretation of Full deploy"
refines:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s one-transition Deploy all boundary"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
refined_by:
  - "[ADR-0435](0435-deployment-transport-may-own-deal-and-attention-is-serial.md)'s serial attention and measured discard flight"
---

# ADR-0434: Full deploy is one placement wave and one discard

## Context

Full deploy was implemented as Play with shorter waits: it resolved one card, waited for its units,
discarded it, revealed the next card, and repeated. That made the control another presentation pace
for the step-through sequence instead of the instant completion action established by ADR-0406.

## Decision

- **Full deploy** commits every remaining automatically placeable unit across every remaining dealt
  card in one model transition and presents those units as one compositor-owned arrival wave.
- It does not play accelerated card reveals, per-unit steps, or per-card discards. Remaining cards
  stay in the Controls pile while the wave lands, then the complete remaining pile shuffles into
  discard as one presentation. Battle begins when that one discard settles.
- Card order and persisted left-to-right seats still determine capacity, placement order, and the
  final formation. Full deploy changes presentation boundaries, not placement results.
- Adlected or any later required player input remains authoritative. Full deploy commits the
  automatic prefix in one wave, pauses on the first required unit, and reveals only the card needed
  for that choice. Completed cards discard together after the wave lands; the player explicitly
  chooses a transport again after resolving the input.
- Play and Next retain the reveal, one-unit settlement, and per-card discard sequence. They are the
  controls for watching Deployment proceed.
- The existing persisted deployment fields can express both the committed wave and a completed
  card prefix awaiting one discard. No RunSaveVersion or database migration is introduced.

## Consequences

- Full deploy is observably instant regardless of how many cards or ordinary units remain.
- Play remains the presentation transport; Full deploy no longer duplicates it at a faster tempo.
- A required manual placement still cannot be skipped or guessed by an automatic transport.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)
- [ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)
