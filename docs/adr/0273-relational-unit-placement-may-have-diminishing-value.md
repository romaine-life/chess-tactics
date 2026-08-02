---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s deployment preferences"
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)'s unit-instance modifier model"
partially_superseded_by:
  - "[ADR-0274](0274-relics-grant-unit-owned-deployment-abilities.md)"
  - "[ADR-0342](0342-agminate-replaces-marshalled-as-the-formation-ability-name.md)'s Agminate name"
---

# ADR-0273: Relational unit placement may have diminishing value

## Context and Problem Statement

A role-aware deployment modifier, discussed under the working label
**Marshalled**, could let a particular unit prefer a piece-specific station. The
Bishop case is relational rather than purely local: the Bishop prefers the
opposite square color from another Bishop. If one modified Bishop can respond
to an ordinary Bishop, a second modified Bishop may produce the same final
opposite-color relationship and therefore add little or no immediate placement
value.

That overlap could be eliminated by inventing an additional independent benefit
for every modified Bishop, or by moving every relational preference back to an
army-wide relic. Either response would make modifier value more regular, but it
would replace the deliberately simple Bishop behavior in order to protect a
pricing abstraction.

## Decision Drivers

- A modifier may be strategically situational without being mechanically
  malformed.
- The player should be allowed to judge roster context and diminishing value.
- Piece-specific deployment behavior should stay concise and legible.
- New placement benefits should exist because they improve the game, not merely
  to force every repeated modifier to pay out linearly.

## Considered Options

- Add an independent strong-diagonal or mobility preference so every modified
  Bishop always produces a separate benefit.
- Keep relational formation rules exclusively on relics and forbid them as
  unit-instance modifiers.
- Keep the simple unit-owned opposite-color preference and accept that its
  marginal value depends on the rest of the roster.

## Decision Outcome

Chosen: **keep the relational preference on the particular unit and accept
nonlinear value.**

- The role-aware deployment modifier is owned by a particular unit instance,
  but its preference may inspect other units in the formation.
- For a Bishop, the complete behavior currently decided is simply: **prefer a
  square color opposite another Bishop.** Do not add diagonal length, back-rank
  placement, mobility, or another compensating benefit merely to make repeated
  copies independently valuable.
- An ordinary Bishop may serve as the reference for a modified Bishop's
  preference without acquiring the modifier itself.
- One modified Bishop beside one ordinary Bishop can therefore be enough to
  produce the desired opposite-color relationship. Two modified Bishops do not
  receive a promised additional payoff solely because the modifier appears
  twice.
- A lone modified Bishop may have little or no immediate benefit. That and the
  diminishing marginal value of later copies are visible roster-evaluation
  problems for the player to weigh, not defects the rules must erase.
- The modifier's final public name, price, behaviors for other piece types,
  exact deployment-resolution algorithm, and which relics retain or grant
  related preferences remain separate decisions.

### Consequences

- Good: the Bishop rule remains extremely simple.
- Good: modifiers can create contextual shop judgments instead of functioning
  as universally efficient upgrades.
- Good: an individual unit can reason about a formation without every referenced
  unit sharing its modifier.
- Cost: repeated copies of the modifier may be worth substantially less than
  the first in some rosters.
- Cost: a fixed modifier price, if adopted, will describe average or potential
  value rather than guaranteeing equal marginal value in every purchase.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)
