# ADR-0539 — Par is turns, and the speed bonus is the clock

**Status:** Accepted
**Date:** 2026-08-08

## The problem

A won Battle paid a flat reward: half the enemy force's material plus a gold a King. Nothing about
*how* it was won moved the number. Winning in nine turns and grinding the same board out in thirty
paid exactly the same, so there was no incentive anywhere in the Run to play decisively.

Two obvious ways to add one both fail on their own:

- **Reward fewer turns.** Turns are the honest measure of a tactics game, but a turn count is a
  discrete number with no per-level meaning — nine turns is fast on one board and impossible on
  another. Without a per-level benchmark there is nothing to compare it to.
- **Reward a faster wall clock.** A clock has a natural per-level meaning only if the level authors
  one, and no shipped level did. Worse, `timeControl` (ADR-0053) is *lethal*: `expireClock` in
  `game/store.ts` loses the Battle at zero. Hanging a reward on a clock that can also end the fight
  turns a tactics game into a blitz game, and punishes exactly the calculation the genre is about.

## The decision

**Par and speed are two different things, and only one of them is a rule.**

- **Par is the level's turn budget, in moves.** It is authored per level (`Level.parTurns`), it is
  hand-tuned, and it is a **benchmark, never a rule** — crossing it wins nothing and loses nothing.
  The victory screen reports the standing ("5 under par of 14") and that is all it does.
- **Speed is the clock.** Par sizes a **bonus clock** — `parTurns × SPEED_BONUS_SECONDS_PER_PAR_TURN`
  — and whatever is left of that clock when the Battle is won pays a small gold bonus, scaled
  linearly to a cap.

One authored number produces both. An author tunes par in moves and never has to reason about
seconds; the clock follows.

### The bonus clock is not lethal, and is not `timeControl`

It deliberately does **not** reuse `ClockState`. Running the bonus clock out costs the bonus and
nothing else: no flag falls, the Battle continues, and a player who wants to sit and calculate may.
Only the reward moves. That is the whole reason a speed incentive is safe to add here — the failure
mode of a lethal clock is a worse game, and the failure mode of this one is 0.0 gold.

It is also why there is no countdown on the battlefield. The title-bar chip keeps counting elapsed
time upward, exactly as before; the bonus clock is reported at the end, on the screen that reports
every other measure of the fight.

### The bonus is deliberately small

`SPEED_BONUS_MAX_TENTHS` is 10 — one gold, at a perfect clock. Against a Battle reward that runs
5–10 gold, a starting bank of 8 and a mean card price near 3.4, that reads as a nudge and never as
the point of the fight. A player who plays badly and fast must not out-earn one who plays well.

### An unauthored par is estimated, not absent

`derivedParTurns` estimates a par from the board — two turns per enemy plus a small allowance, and a
`survive` board's own turn target when it has one. Without this the field would pay nothing on every
level that predates it, and the feature would be invisible until every level had been hand-tuned.
The estimate is labelled as an estimate in the editor and is only ever a fallback: an authored par
always wins.

Only an **authored** par is written to the document. Leaving the field absent is what keeps the
estimate live, so an untuned level re-estimates as its board changes rather than freezing whatever
the panel happened to show.

### The bonus is derived, never stored

`speedBonusTenths(level, elapsedMs)` is pure. `closeBattle` pays with it, and the aftermath screen
re-derives the identical number from the report's frozen `elapsedMs` and the Battle's own level.
The persisted `RunAftermathState` therefore gains **no field**, which is what keeps this off the
backend's aftermath allowlist and out of a `RunSaveVersion` bump.

The elapsed time is read from the wall clock **once**, in `closeBattle`, and frozen onto the report.
Re-reading it when the gold is banked at Continue would pay a smaller bonus than the screen
promised, because the player may sit on the report for as long as they like.

## Consequences

- `Level.parTurns` is a new optional field. Additive and back-compat: `validateLevel` ignores
  unknown fields, `LEVEL_FORMAT_VERSION` is unchanged, no schema migration, no `RunSaveVersion` bump.
- Gold won on the aftermath screen now includes the speed bonus, and its detail line names every
  source folded into it so the ledger reads as a breakdown rather than as extras stacked on top.
- The final Battle of a War pays no speed bonus, because it pays no spendable reward at all and has
  no aftermath screen (ADR-0220).
- Par is authored in the Level Editor's **Rules** panel, beside the battle clock, with a Reset back
  to the estimate (ADR-0057).
- A campaign or skirmish win still shows no stats at all. Par is computed for those levels and
  nothing displays it, because those surfaces have no ledger to put it in. When they grow one, it is
  already there to read.

## Verification

`frontend/src/core/speedBonus.test.ts` pins the math: the cap, the linear scale, the
floor at an exhausted clock, a null elapsed paying nothing, authored par beating the estimate, and
the `survive` special case. `frontend/src/run/speedBonusAward.test.ts` pins the Run behaviour that
matters — that the aftermath's reported gold and the gold actually banked at Continue are the same
number, and that sitting on the report does not shrink it.
