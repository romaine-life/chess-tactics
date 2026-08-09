---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0220](0220-run-victory-gold-scales-with-enemy-force-value.md)"
  - "[ADR-0539](0539-par-is-turns-and-the-speed-bonus-is-the-clock.md)"
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0543: A mate is paid for the army it did not have to take

## Context

Every Run Battle is won by checkmate. The only authored mode is King Assault, whose win rule
wants the enemy King *captured* — and legal-move generation never lets a King be left en prise,
so that rule cannot fire. `adjudicateCommittedPosition` evaluates victory rules first and
checkmate second, and with the first unreachable, mate is the sole ending a Battle has.

The Battle's own reward is `battleVictoryGoldTenths(level)`, computed from the enemies the level
**fields** rather than the ones the player **takes**. So mating on move twelve against a whole
army and grinding sixty moves down to a bare King paid exactly the same gold. Grinding is
strictly safer. The economy was quietly recommending the dullest way to play, and the only thing
pulling the other way was the speed bonus, capped at one gold.

Nothing was wrong with the reward. What was missing was a price on the *choice*.

## Decision

- **Deditio** — the surrender of a force still standing when its King falls. A won Battle pays
  **0.2 gold for each point of enemy force alive on the committed final board**. The name is the
  Roman term for a capitulation, and it is the register the rest of the Run already speaks
  (Sectio, Adlectio, Manubiae, Bona Vacantia).
- **Two tenths a point is the advantageous-capture rate from ADR-0540**, deliberately. Material
  won and material the player never had to take are worth the same per point, which is the
  internal consistency worth having. Against a typical Battle — an enemy force near sixteen
  points, paying nine gold — mating with the army whole banks 3.2, about one card; grinding to a
  bare King banks nothing.
- **The floor is today's payout.** A ground-down mate scores zero, which is precisely what such a
  mate has always paid. No Run gets worse; only the ceiling moves. It is also the only reward in
  the Run that a player can *lose* by playing longer, which is the whole of its job.
- **Priced from a stored count, not a remembered number.** The aftermath records
  `standingEnemyValue` — the fact — and both the report screen and the Continue that banks it
  price it through `deditioGoldTenths`. This is the shape ADR-0539 established for the speed
  bonus and its reason is the same: the board is gone by the time either asks, so the screen and
  the banking must read one number twice rather than agree by luck. Storing the gold instead
  would let a later re-derivation drift from what the player was shown.
- **A unit is worth what it STARTED as**, through `manubiaeUnitWorth`. A promoted enemy pawn
  surrenders as a Pawn. The King and obstacles have no purchase price and count for nothing —
  which is exactly what makes a stripped King score zero rather than one.
- **Every living enemy counts, spawned ones included.** They were on the board and they
  surrendered with the rest. This reads the committed board rather than the level, so a
  reinforcement that arrived mid-Battle is counted the same as one that started there.
- **A crafted aftermath defaults to the whole force the level fields.** A placed Battle killed
  nothing, so an untouched enemy army is the honest reading — and it is the state worth landing
  on, since a Deditio of zero shows an empty measure. `standing=<n>` overrides it, and belongs to
  `craft=aftermath` alongside `turns`, `seconds` and `fallen`, for the same reason: a Battle that
  was placed rather than played cannot produce its own report.
- **RunSaveVersion 36**, with the canonical database migration and the browser-storage migration
  to match. A Run already parked on an aftermath earned its gold under the old rules and its
  total is settled, so the field arrives as the zero it truthfully was: that report was never
  paid a Deditio, and Continue banks exactly the total the screen has been showing.
- **No Enchiridion section.** Deditio is a Battle reward, like the speed bonus and unlike
  Manubiae, and it is explained where it is paid — a measure on the aftermath ledger naming the
  points that surrendered.

## Consequences

- Lifetime gold rises by roughly a fifth on a run that mates decisively, and not at all on one
  that grinds. That spread is the design. If the absolute inflation ever needs trimming, the
  lever is the base reward's 0.5 gold per point of *fielded* enemy material — not this rate,
  which is the signal itself.
- The Unclaimed Dagger sets `checkmateRequiresEnemyNonKingEliminated`, which suppresses checkmate
  until every enemy non-King is dead. A Run holding it therefore scores zero Deditio for the rest
  of the War, structurally and permanently. Its ten gold now buys a real cost, which makes it the
  sharpest trade-off in the lipsanon set rather than a free grant with a mild inconvenience
  attached.
- The speed bonus and Deditio pull the same way and stack. That is intended: both pay for ending
  the fight rather than administering it, and between them they cap out near a third of a
  Battle's own reward — a loud incentive that is still never the point of the fight.
- Restart is unaffected: it rewinds to before the Battle, so there is nothing banked to farm.
  Undo is likewise untouched, since Deditio is paid at close and not per move.
- A future mode whose win rule *can* fire before mate would collect no Deditio, correctly — the
  army did not surrender, it was destroyed. Nothing needs adding for that; the reward is read off
  the board the mate produced.
