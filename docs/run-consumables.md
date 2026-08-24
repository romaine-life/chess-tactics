# Run consumables ("potions") — parked note

**Status: idea note, not a plan.** Nothing here is built, scheduled, or decided. Recorded
2026-08-20 so it can be found later. No fixed count, no art, no slot placement, no economy
numbers.

## The constraint that governs the whole idea

**Once the first move is made, it is chess.** No effect acts on a running Battle — no fire,
no explosions, no teleports, no skipped turns, no resurrections, no rule changes mid-game.
This is not a balance preference; it is the identity of the game (game-concept.md §3
pillars 1 and 5; ADR-0193 states the piece-behavior half of it for lipsana).

Everything a consumable is allowed to do therefore happens **before ply 1**, and falls in
exactly three levers:

| Lever | What it edits |
|---|---|
| **Placement** | where units stand when the Battle opens |
| **Roster** | which units are present, on either side |
| **Board setup** | the terrain and obstacles the Battle is fought on |

An idea that does not fit one of those three is out, however good it sounds. That is the
filter to apply first.

**Undo and restart are a separate category, not an exception.** They do not act on a
position — they rewind or replay the whole Battle from outside it, so they survive the rule
above while every mid-Battle effect fails it.

They also **already exist as priced Run actions**: Undo costs 1 gold, a Battle retry 3, a
deployment reroll 1 (5 once a Battle has opened) — `RUN_BATTLE_UNDO_COST_TENTHS`,
`RUN_BATTLE_RETRY_COST_TENTHS` and the reroll constants in
`packages/board-render/src/run/model.ts`. A single-use consumable here is therefore only a
voucher for something already buyable, and a one-for-one voucher is not worth a slot.

**So undo belongs as a lipsanon, not a consumable.** A relic granting one or two free undos
**per Battle, refreshing each Battle**, is the right shape: it is permanent and passive like
every other lipsanon, it is worth far more than the 1 gold a single voucher saves, and its
value scales with how long the Run lasts rather than being spent and forgotten. The same
reading applies to a free retry per Conflict. Royal Tent is the precedent — held for the Run,
effective per Battle.

## What it is

A **single-use active item**, spent by the player at a chosen moment, as distinct from a
lipsanon (permanent passive relic, `packages/board-render/src/core/runLipsana.ts`). Purpose
is **variety and monotony-breaking** across a long Run, not power growth.

| | Lipsanon | Consumable |
|---|---|---|
| Duration | whole Run | one use, then gone |
| Player input | none (passive rule) | the player picks when, and usually what |
| Acquired | Bona Vacantia | unassigned — Bona Vacantia, Sectio purchase, or Battle reward |

## Nelson's list (verbatim in substance)

1. Convert a unit into another unit.
2. Deploy a unit — random or chosen — onto a random tile. Possibly one or more pawns.
3. Fill every empty space with pawns.
4. Place a rock on the battlefield.
5. Swap the position of two units.
6. Undo one move (any time) — **reconsidered as a lipsanon**, one or two free undos per
   Battle, per the section above.
7. Restart the Battle for free (any time) — same reconsideration.

## Suggested additions

All names are placeholders. Grouped by the three levers.

### Placement

- **Reposition one unit** anywhere legal in the deployment zone. The precision version of
  swap — swap is constrained by what is already placed; this is not.
- **Deploy off-zone** — place one unit on any square of your half, ignoring the authored
  placement zone. The zone is the tightest constraint the Run has, so lifting it once is a
  large effect from a small rule.
- **Extend the zone** — the deployment zone gains one rank forward for this Battle. The
  same idea applied to the whole army instead of one unit.
- **Mirror your formation** across the board's long axis. One button, whole-army effect,
  interesting exactly because the enemy setup is not symmetric with it.
- **Advance the back rank one square.** Tempo for exposure. Cheap to author, immediately
  legible.

### Roster

- **Remove one enemy pawn.** The cleanest strong effect in the set. Reads instantly, needs
  no explanation, scales by what the player picks.
- **Turn one enemy pawn to your side.** Double swing; strictly stronger than removal, so it
  prices higher or restricts to pawns on their own half.
- **Demote an enemy piece** — their Queen fields as a Bishop for this Battle. The mirror of
  Nelson's "convert a unit", pointed the other way.
- **Unblock a capacity-blocked unit.** ADR-0193 blocks excess persistent units when the
  zone is too small; a consumable that forces one in uses machinery that already exists and
  answers a frustration the player already feels.
- **Hire a mercenary** — field one unit that is not in your army, for this Battle only. Adds
  force without touching the persistent roster the Run is scored on.

### Board setup

- **Clear terrain** — remove a rock. The inverse of "place a rock", and the answer to a
  board whose obstacles sit on the line the player needs.
- **Place water.** Water halts movement on entry and Knights hop it, so one tile changes the
  geometry of a whole quarter of the board with an authored rule already in the game.
- **Lay a wall** — a short line of rocks rather than a single one. Same primitive, bigger
  gesture, closes a file or shields a diagonal.

## Open questions to settle before any of this is built

- **"Fill every empty space with pawns" — whose empty spaces?** The whole board is a joke-tier
  ultimate (funny once, unplayable). Own half, or own deployment zone, is the buildable read.
- **Random targeting is hostile to a tactics game.** The player is being asked to calculate;
  a random tile makes the calculation unownable. Keep randomness for cheap or bulk effects,
  and let anything expensive be chosen.
- **How many free undos, and does the Run keep enough history?** A per-Battle undo lipsanon
  needs a count (one or two) and needs the Battle to retain more than the single checkpoint
  `captureRunBattleUndo` keeps today if it is to grant two in a row.
- **Where do they come from?** Bona Vacantia already deals lipsana; adding a second item type
  to the same offer dilutes both. A Sectio purchase line or a Battle reward is the alternative.
- **Slot count and where the slots sit** — unassigned. The pre-battle window currently has no
  screen of its own; either it grows one, or the Battle board carries a pre-first-move
  overlay that cannot be dismissed by accident.
- **Enemy-side edits need an authoring answer.** Removing or demoting an enemy piece changes
  an authored Battle, which the Deditio payout is computed against. Decide whether the payout
  reads the authored force or the edited one.
- **Save format.** Consumables are per-Run mutable state, so they need a RunSaveVersion bump
  and the usual migration (`docs/migration-policy.md`).

## Naming

The Run's vocabulary is Latin/Byzantine (Sectio, Adlectio, Commendatio, Bona Vacantia,
Manubiae, Deditio, Chartulary, Enchiridion, Strategikon, lipsanon). The obvious fit for a
single-use flask beside a relic is **ampulla** (pl. *ampullae*) — the small pilgrim flask
that carried oil from a saint's shrine, historically carried alongside lipsana. *Pharmacon*
is the alternative if the flavour should read as medicine rather than pilgrimage.

## Rejected

Kept here so they are not re-proposed. Each acts on a running Battle, which the constraint
above forbids: skip the enemy's next turn; resurrect a unit that fell this Battle; a ward
that survives one capture; reveal the enemy's intended move; withdraw mid-Battle; promote a
pawn early. Rules changes that only apply "for this Battle" are still rules changes.
