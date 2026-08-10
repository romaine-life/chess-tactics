---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0564: Eight squares of reach is a deed

## Context

Every Manubium so far prices a RELATIONSHIP between pieces — a fork's two prongs, a discovery's
opened line, a King hemmed by its own men. ADR-0540 chose that deliberately, keeping the motifs
"defined by *local relationships between pieces*, which read the same on any board" and throwing
out everything anchored to rank-and-file geometry.

The owner asked for the opposite property: *"bonuses for captures and checks that span 8 squares,
from any unit."* Distance, not shape. It survives ADR-0540's two filters anyway — a distance is
read off two squares on the committed board, needing no search and no opponent reply — but it is
the first entry that asks how BIG the board is rather than what is standing on it.

## Decision

- **Two entries, because a capture and a check are two deeds.** `long-capture` pays 10 and
  `long-check` pays 20. The capture is usually one the player wanted to make anyway and the
  distance is the flourish on it, which is ADR-0540's ten-gold "the Run noticing something you
  were going to do anyway"; the check had to be engineered — the enemy King has to be ON that line,
  eight away, with nothing in between — so it pays double.
- **Eight squares, because that is the width of a standard chessboard.** No board in this game is
  that shape, which is the point: it is the one reach every player already has a feel for.
  `RUN_LONG_REACH_SQUARES` names it once.
- **Counted along the LINE, not as both axes added up.** `max(|dx|, |dy|)`, so a Rook eight along
  a rank and a Bishop eight along a diagonal are the same eight. Summing the axes would make the
  Bishop's eight into sixteen and the same threshold would mean a different thing to every unit;
  the discriminating case is pinned in the tests, where a seven-square diagonal — fourteen by the
  wrong metric — pays nothing.
- **A capture is measured on the MOVE; a check is measured on the LINE THE CHECK RUNS.** They are
  different questions and each takes its own answer. A capture's reach is how far the unit came to
  make it, from the square it set out on to the square it landed on. A check's reach is from the
  unit giving check to the King, which means the checker **need not be the unit that moved**: a
  line you opened reaches from wherever the unit behind it stands, and that reach is the deed. So
  a discovery from across the board earns the discovered check AND the long check.
- **Paid once per check, seated on the checker that reaches furthest.** There is one check to pay
  for however many units are giving it. Each checker is paired with the King it is actually
  attacking, via the same `attacksSquare` geometry check detection uses, so a board fielding more
  than one enemy King cannot be credited with a line it does not have.
- **Any unit may earn it, and the type is not consulted.** In practice only the line pieces reach
  eight — a Knight's longest move is two — but nothing here says so, because that is the board's
  business and not a rule. If a later unit or terrain rule moves something eight squares, it earns
  this without an edit.
- **Everything stacks.** Reach is orthogonal to material and to the shape of a check, so a Rook
  crossing the board to take a Queen earns the long capture and the advantageous capture, and a
  long discovered check earns both of those. No ladder, no in-place-of: nothing here is a kind of
  anything else.
- **A board smaller than nine in both dimensions can never offer these, and no arrangement is made
  for that.** Such a Battle simply has no long moves in it, which is true and needs no clause.
- **The two Enchiridion diagrams break the section's five-square convention**, at nine by five and
  nine by nine, because the deed does not fit on a board that size. Each marks the whole lane the
  unit crossed, so the distance is the picture rather than a number in the copy — the long-check
  entry is the full corner-to-corner diagonal of a nine-square board.
- Board law is untouched, and no RunSaveVersion, save shape, or database migration changes.

## Consequences

- **This is the first Manubium whose availability is a property of the LEVEL rather than of the
  play.** The War's Battles range from three squares wide to nine, so some of them cannot offer
  these bounties at all while others offer them freely. That unevenness is real and is not a
  defect: it hands level authoring a lever it did not have, since a big open board is now a board
  where long-range play pays, and a cramped one is not.
- **Terrain is what makes it rare.** Water halts travel, walls and fences close crossings, and
  every unit in the way blocks the line, so eight clear squares on a dressed board is far less
  common than eight clear squares on an empty one. The bounty therefore rewards recognizing open
  ground, which is a thing this game has and chess does not.
- A Knight can never earn either of these. That is worth stating because it is the first entry
  with a unit that is structurally shut out, where `humble-mate` merely pays a Queen zero.
- `verify:manubiae` can reach `long-capture` and `long-check` on any Battle wide enough to hold
  one, but still not from a CRAFTED position, for the reason ADR-0562 records: craft produces
  untouched openings whose armies are not in contact, and the gate refuses to manoeuvre.
