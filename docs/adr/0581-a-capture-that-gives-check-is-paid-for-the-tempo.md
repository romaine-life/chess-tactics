---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0581: A capture that gives check is paid for the tempo

## Context

The owner asked for it in one sentence: *"taking a piece and putting the king in check in the same
move should get a bonus."*

Every Manubium so far pays for something about the position — the material a capture won, the shape
of a check, the reach of a line, how little is standing there giving mate. None of them pays for
the one thing this move buys, which is a MOVE. The enemy has to answer the check, so whatever they
meant to do about the capture — take back, counter-attack, save the piece next to it — waits a
turn, and by then the position has moved on. That is the whole reason "look for the capture that
also checks" is standard advice, and the catalog had no way to say it.

It clears ADR-0540's two filters without argument: both halves are read off the committed board,
neither needs a search, and neither depends on the opponent's reply.

## Decision

- **One entry, `capture-with-check`, at ten gold.** It sits at ADR-0540's noticing pole — "the Run
  noticing something you were going to do anyway" — beside the long capture and the royal fork,
  rather than with the checks that had to be engineered at twenty. The capture is usually one the
  player wanted anyway and the check is the flourish on it, and this is the most frequently
  available entry in the catalog after the advantageous capture it usually rides along with. A
  Knight taking a Rook with check pays 4 for the material and 10 for the tempo.
- **The deed is a property of the MOVE, not of a unit.** The move took an enemy unit and the enemy
  King is in check on the committed board. Nothing asks which unit gives the check, so a capture
  that opens a line behind it earns this exactly as a capture that checks from where it lands —
  the player took a piece and gave check in the same move either way, which is what was asked for.
  No before-and-after comparison is needed for the check itself: the enemy King could not already
  have been in check on the player's turn.
- **No safety clause, unlike a fork.** ADR-0527 refuses to pay a fork the enemy can profitably take
  because taking the forking unit IS how they answer the check, so such a fork never collects its
  second prong and paying for it teaches a blunder. Nothing of that applies here: the material is
  already in hand when the check lands, and a recapture is the ordinary exchange it always was. The
  advantageous capture already declines to ask whether the victim was defended, and this follows it.
- **It stacks with everything, including the mate.** It is not a rung of the discovered/double-check
  ladder: those grade the SHAPE of a check, and this pays for a capture coinciding with one, so a
  discovered check that also takes something did two things and is paid for both. The mate ladder
  collapses to one entry among itself (ADR-0562) and has never collapsed the check deeds into it —
  a discovered mate already pays the discovery too — so a capture that mates pays this as well.
- **Seated on the square the capture landed on**, with the other capture deeds rather than on the
  checker. That is the unit the player just played, and on the uncovered-check case it is the only
  square worth looking at. (For an en passant that is the square stepped over, as it always is.)
- **The Enchiridion draws both halves in one diagram**: a Rook comes up the file to take a Bishop
  and runs along the rank into the King from the square it took on, with the squares it crossed and
  the square the check runs through both marked.
- Board law is untouched, and no RunSaveVersion, save shape, or database migration changes.

## Consequences

- **This will be the most-earned fixed entry in the catalog**, which is exactly why it is priced at
  the bottom of the band. Ten gold several times a War is the Run noticing good habits; twenty would
  have made the tempo worth more than the discovery that had to be arranged for it.
- **It is the first entry that pays for what the opponent CANNOT do next**, rather than for
  something standing on the board. The reading is still positional — a check is a fact about the
  committed position — but what it is paying for is a turn, which is a currency nothing else here
  prices.
- A player who takes with check while hanging the capturing unit is still paid. That is deliberate
  and stated above; the alternative is a safety clause whose only effect would be to withhold gold
  for a trade the player already made.
- `verify:manubiae` can reach it with `--want capture-with-check` on any position that offers a
  capture landing on a checking square — an easier ask than most of the catalog, though still not
  from an untouched crafted opening, for the reason ADR-0562 records: the armies are not yet in
  contact and the gate refuses to manoeuvre.
