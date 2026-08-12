---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0584: A capture that gives check is paid for the tempo

## Context

The owner asked for it in one sentence — *"taking a piece and putting the king in check in the same
move should get a bonus"* — and amended it before it shipped: *"while not attacked."*

Every Manubium so far pays for something about the position — the material a capture won, the shape
of a check, the reach of a line, how little is standing there giving mate. None of them pays for
the one thing this move buys, which is a MOVE. The enemy has to answer the check, so whatever they
meant to do about the capture — take back, counter-attack, save the piece next to it — waits a
turn, and by then the position has moved on. That is the whole reason "look for the capture that
also checks" is standard advice, and the catalog had no way to say it.

The amendment is what makes it that advice rather than its opposite. A capture with check that
leaves the capturing unit hanging is very often a donation dressed up as a tempo move: the enemy
answers the check by taking it, and the free move was the player's material walking off the board.
A bounty that paid for both would teach the blunder alongside the tactic.

Both halves clear ADR-0540's two filters: everything here is read off the committed board, nothing
needs a search, and nothing depends on the opponent's reply.

## Decision

- **One entry, `capture-with-check`, at ten gold, with three clauses that must all hold.** The move
  took an enemy unit; the enemy King is in check on the committed board; and the unit that took is
  not attacked where it now stands.
- **The first two clauses are properties of the MOVE, not of a unit.** Nothing asks which unit gives
  the check, so a capture that opens a line behind it earns this exactly as a capture that checks
  from where it lands — the player took a piece and gave check in the same move either way. No
  before-and-after comparison is needed for the check itself: the enemy King could not already have
  been in check on the player's turn.
- **The third clause is about the unit that TOOK.** That is the one standing somewhere new, and the
  one the enemy can collect while answering the check. A checker sitting where it already was is
  not asked about: they have to deal with the check first.
- **"Not attacked" is attack geometry, not legality — the plain board reading of the word.** Is
  anything of theirs looking at that square. An attacker pinned against its own King still counts,
  and so does an enemy King eyeing a square it may not legally enter because the unit is defended.
  This is deliberately the stricter bar: the player is being taught to land somewhere clean, and
  "defended, so the trade is fine" is a different lesson that the advantageous capture already pays
  for. `unitIsAttacked` in `core/rules` is the mirror of the existing `unitIsDefended`, reading the
  same `attacksSquare` geometry check detection uses, rather than a private loop at the Run seam.
- **This is a different bar from the fork's `forkHolds`, and both are right.** A fork asks whether
  taking the forking unit COSTS the enemy more than it is worth, because a fork that can be taken
  at a profit never collects its second prong. Here there is no second prong to lose — the material
  is already in hand — so what is being asked is not "would the exchange be good" but "did you leave
  it in the open", which is the simpler question the owner asked for.
- **Ten gold, at ADR-0540's noticing pole**, beside the long capture and the royal fork rather than
  with the twenty-gold checks that had to be engineered. The capture is still one the player wanted
  anyway; the safety clause is what keeps the entry from teaching a donation, not what makes it
  dear. A Knight taking a Rook with check pays 4 for the material and 10 for the tempo.
- **It stacks with everything, including the mate.** It is not a rung of the discovered/double-check
  ladder: those grade the SHAPE of a check, and this pays for a capture coinciding with one, so a
  discovered check that also takes something safely did two things and is paid for both. The mate
  ladder collapses to one entry among itself (ADR-0562) and has never collapsed the check deeds into
  it — a discovered mate already pays the discovery too.
- **Seated on the square the capture landed on**, with the other capture deeds rather than on the
  checker. That is the unit the player just played, and on the uncovered-check case it is the only
  square worth looking at. (For an en passant that is the square stepped over, as it always is.)
- **The Enchiridion draws what can be drawn**: a Rook comes up the file to take a Bishop and runs
  along the rank into the King from the square it took on, with the squares it crossed and the
  square the check runs through both marked. The third clause is an absence — nothing on that board
  attacks the square the Rook takes on — and no mark can show it, exactly as the fork diagrams
  cannot show that the fork holds.
- Board law is untouched, and no RunSaveVersion, save shape, or database migration changes.

## Consequences

- **The bounty and the blunder now point the same way.** Before the amendment the most common way to
  earn this was to shove a piece next to their King, take something, and be taken; the entry would
  have paid ten gold for the worst move on the board. It now pays only when the tempo is real.
- **It is scarcer than a bare capture-with-check rule, and still the most reachable check deed.** A
  quiet capture that happens to check from a square nothing covers is an ordinary thing to find;
  what is no longer ordinary is being paid for the noisy version of it.
- **A defended-but-attacked landing square earns nothing, and that is the sharp edge.** A Queen
  taking beside the enemy King with a Rook behind her is a fine move and pays only whatever the
  material was worth. If that reads as too strict in play it is a one-word change to
  `sideCanCaptureUnit`, which asks the legal question instead; the strict reading ships first
  because it is what was asked for and because it is the version a player can check at a glance.
- `unitIsAttacked` is now available to everything else in the rules — the enemy AI, future
  Manubiae, any surface that wants to say "that unit is hanging" — where before only the defence
  half of the question had a name.
- **No crafted opening can demonstrate this one, and that was measured rather than assumed.** 216
  crafted Battles were swept — every Battle of the Run-eligible War, six seeds each, armies from
  four units to eight — and not one offered a safe capture with check in a single move. The reason
  is the shape of the thing: a crafted Battle is placed and not played, so where the armies touch
  at all they touch beside the enemy King, and a capture there is a capture the King is looking at.
  `verify:manubiae` therefore cannot prove this entry from a craft link, and correctly refuses to
  manoeuvre toward one (ADR-0562). It was proved instead by walking a real Battle into the deed with
  real clicks: fifteen plies into a crafted Battle 5, `Qxd5+` moved gold 264 → 274, the log read
  "Capture with check — 10 gold claimed", and the marker seated on d5 with the Queen unattacked two
  squares from their King. A gate that wants this entry needs a mid-Battle position, which the craft
  grammar does not express — it takes an army and a phase, never a board.
