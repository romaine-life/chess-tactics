# ADR-0368: Conflicts open with Bona Vacantia instead of closing with loot

## Status

Accepted.

## Context

A Run's relics used to arrive at the **end** of a Conflict. Beating a loot Battle rolled
three offers into the shop that followed it, and the shop could not be left until one was
taken. The player chose having just fought three Battles, knowing exactly what had hurt,
and then spent gold in the same screen — the relic was a reward, and it combined with the
purchase made seconds later.

The reference point for the replacement is Slay the Spire's opening blessing: a choice made
before the run proper, shaping what follows rather than settling what came before. That
game frames it as a benediction from a figure who meets you. This world has nobody to bless
anyone, so the equivalent had to come from somewhere else.

It comes from provenance. Goods change hands because a household, a chapel or a farm
stopped, and what it owned is being counted, tagged and moved by people who did not own it
and are not explained. The relic flavor texts already lived there — "It was counted with the
valuables. No hand claimed it." / "The vessels were weighed after the prayers had stopped."
**Bona vacantia** is the real legal term for it: ownerless property, the estate of someone
who died with no traceable kin. The same move as naming a difficulty after the Great
Mortality (ADR-0266) — a true term from the record, not invented lore.

## Decision

**A Conflict opens with a Bona Vacantia screen: three relics, one taken, before the shop
that leads into the Conflict's first Battle.** `bona-vacantia` is a Run phase of its own,
carrying its own offers on `RunDocument.vacantia`.

Consequences of the placement, all deliberate:

- **Before the shop, not after.** The player inherits the relic and *then* decides what to
  spend on. Shop-then-relic would make the opening shop's fixed gold feel like it came
  before the Run had been met.
- **Derived from loot Battles, not from Battle numbers.** A Conflict already means "the
  Battles through the next loot Battle" (ADR-0193), and `loot` is authored per Battle on
  the War. A Conflict opens with a relic when there is a loot Battle at or after its first
  index, so a stretch with none left is the Run's final approach and gets nothing. On the
  official ten-Battle War, with loot on 3/6/9, that lands on Battles 1, 4 and 7 and leaves
  Battle 10 relic-free — without hardcoding any of those numbers.
- **Moved, not added.** The loot relic is gone from the shop entirely; `lootRelicOffers`
  and `chosenLootRelicId` are removed rather than left dead. Three relic events a Run burns
  nine of twenty relics, and reveal is burn-on-sight. Six events would burn eighteen of a
  pool that is effectively nineteen, and After-Hours Key's per-Conflict paid relic pushes
  past the end of it. Keeping both is a content problem, not a balance one.
- **Still mandatory.** There is no way past the screen without taking a relic, exactly as
  the loot shop could not be left without one. Taking is also what opens the shop behind it.

The Run is **front-loaded** by this. A relic won at the end of Conflict 1 was active for
Battles 4-10; taken at the head of Conflict 1 it is active for 1-10, and the first one gains
most. That is an accepted tuning consequence, not an oversight.

## Consequences

`RUN_FORMAT_VERSION` moves to **13**. In-progress Runs on any account stop loading: a
format-12 document has no offer to show and a shop that still expects a loot pick, so it is
discarded rather than half-migrated.

The opening Shop's server contract had to widen in exactly one place. Bona Vacantia now runs
*before* it, so a relic taken there may already have paid out, and the pinned
`entrySnapshot.goldTenths` is no longer literally 80. It is pinned to 80 plus what the held
relics are worth on acquisition, computed from `RUN_RELIC_IMMEDIATE_GOLD` — one table read
by the model to grant and by the server to verify, so the two cannot drift. Every other
value the opening contract pins is unchanged.

`RunScreen`'s phase dispatch ends in an else-fallthrough to Victory, so the new phase needed
an explicit branch; a phase without one renders the Victory screen silently.

Craft gains `craft=bona-vacantia`, and `loot=` now writes the Conflict's opening offers
rather than shop loot. Fast-forwarding takes the first acceptable offer at every Conflict
head, because reaching any later state means making the same mandatory choice a player would.

The screen's art is owner-chosen and installed: the Spolia · Table backdrop
(`ui/workspaces/run-bona-vacantia/background.png`) and the Opened Case mat
(`ui/run/bona-vacantia/mat.png`), the mat drawn at 1.74x the relic row. Relics sit on it
raw at their installed 64x64 with a one-pixel stroke — no card, no name, no effect text;
the words arrive on hover through the shared Tooltip.
