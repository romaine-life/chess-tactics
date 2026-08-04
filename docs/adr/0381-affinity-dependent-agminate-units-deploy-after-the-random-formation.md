---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s one-unit queue"
partially_supersedes:
  - "[ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)'s random automatic-placement order"
refines:
  - "[ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)"
  - "[ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)"
---

# ADR-0381: Affinity-dependent Agminate units deploy after the random formation

## Context

Agminate is a unit-owned, role-aware formation ability. Its Bishop rule already inspects other
Bishops, but ADR-0367 put every non-King unit into one seeded random placement order. An Agminate
Bishop could therefore take its turn before the Bishop it was meant to answer. Hieratic can also
grant Agminate to any unit on a card, but an Agminate Pawn had no corresponding pawn rule at all.

Both roles express affinity for their own type. Their useful reference is the ordinary formation
that random deployment has already produced, so their turns need to follow that formation rather
than sometimes precede it.

## Decision

- Automatic deployment keeps the same seeded shuffle but resolves it in three groups: the King
  first, then the ordinary shuffled group, then Agminate Pawns and Agminate Bishops. Stable
  partitioning preserves the shuffle's relative order inside both non-King groups and consumes no
  new random roll.
- An Agminate Pawn prefers an open square immediately alongside a placed Pawn: one file to its left
  or right on the same row. An ordinary Pawn, an Adlected Pawn, or an earlier Agminate Pawn may be
  the reference.
- An Agminate Bishop retains ADR-0273's complete behavior: it prefers a square color opposite a
  placed Bishop. Deferring its turn makes an ordinary, Adlected, or earlier Agminate Bishop
  available as that reference whenever the formation contains one.
- If every Pawn or Bishop is Agminate, the first member of that type in the deferred seeded order
  establishes the reference without a same-type affinity benefit; later members may inspect it.
- If no qualifying reference exists, or no open eligible square can satisfy the preference, the
  unit keeps the ordinary seeded candidate result. Type-specific deployment pools, Adlected manual
  placement, no-backtracking, held-back units, and the Agminate King and Rook rules are unchanged.

## Consequences

- A Hieratic Pawn now receives a concrete Agminate benefit instead of the generic fallback only.
- Pawn and Bishop affinity is reliable when an ordinary same-type unit exists, while the exact
  seats in the initial formation remain seeded and random.
- These two affinity-dependent roles deliberately act later than other non-King units, narrowing
  ADR-0367's otherwise random free-for-all order.
- Repeated Agminate copies can still have diminishing value, as ADR-0273 permits; the rule does not
  invent a separate payoff for every copy.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0273](0273-relational-unit-placement-may-have-diminishing-value.md)
- [ADR-0274](0274-lipsana-grant-unit-owned-deployment-abilities.md)
- [ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)
