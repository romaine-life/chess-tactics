---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0517](0517-a-player-en-passant-pays-a-five-gold-bounty.md)"
  - "[ADR-0525](0525-a-run-change-inside-a-live-battle-cannot-be-silent.md)"
---

# ADR-0527: A royal fork pays one gold

## Context

ADR-0517 made the board itself pay for the first time: a player en passant claims five gold
the moment it commits. It deliberately picked the rarest capture in chess — one that cannot
be stumbled into and whose window is a single move wide — so the bounty read as recognition
of something specific the player had done.

The owner wants a second thing on the board to pay, and this one is not rare. A fork that
checks the King while also striking a Rook or a Queen is the everyday shape of tactical
chess: it is the reason a knight is worth playing for, and it is the first tactic a player
learns to look for. Its reward is already built into chess — the material you win when the
check has to be answered. Paying for it is not compensation, it is the Run noticing.

That difference is the whole of the pricing. En passant is worth going out of your way for
at five gold precisely because you almost never can. A fork is something a competent player
manufactures several times in a Battle, so it pays one.

## Decision

- A **player** move that lands a **royal fork** pays **1 gold**. A royal fork is one piece
  attacking an enemy King and, from the same square, an enemy non-King worth **5 or more**
  (a Rook or a Queen) — the bar read off `PIECE_VALUE.rook` rather than written as a bare 5.
- **One piece's work.** Both prongs are read off the unit that just moved. A discovered
  check — where the King is attacked by a piece that never moved — is a double attack by two
  pieces and pays nothing. This is the ordinary meaning of *fork*, and it is what makes the
  bounty describable in one sentence to a player.
- **Whether the victim is defended is not asked.** A fork is a fork; what it is worth to
  answer is the position's business, and reading defenders would make the same geometry mean
  different things on two boards.
- Paid the moment the move commits, seated on the forking unit's own square, so the gold
  measure moves while the fight is still on. The aftermath report continues to state only
  the Battle's own reward, which is the number it banks on exit.
- The enemy's forks pay nothing. The mover is read off the committed board, so a Reservist
  or a promoted pawn earns it like any other player unit.
- Per fork, not per Battle. Two in one Battle pay two gold.
- It is not a new kind of state. `core/rules.royalForkVictim` answers the geometry question
  through the same `attacksSquare` scan check detection already uses, and the Run pays from
  that answer through one model transition over the existing `goldTenths` field — with its
  notice welded on, per ADR-0525. No RunSaveVersion, save shape, or database migration
  changes.
- Board law is untouched: no legal-move generator, adjudication path, or position key
  consults the bounty, and a Skirmish or campaign level outside the Run economy pays nothing
  (ADR-0193).

## Consequences

- Undo reverses the bounty exactly, with no special case — the checkpoint predates the move,
  so taking the move back takes the gold back and charges the ordinary one-gold Undo on top.
  A fork is therefore never worth undoing for profit; it nets zero.
- A fork cannot sit and pay every turn, because the check has to be answered and only the
  move that lands the strike is examined. A position that lets the same fork be
  re-established after each escape does pay each time. That farm is left open: at one gold
  it is worth less than the tempo it costs, which is exactly the argument that could not be
  made at five (ADR-0517 left the Restart farm open on the same terms).
- One gold is small against this economy — an eighth of a typical eight-gold Sectio card.
  That is the intent. This bounty is a nudge toward playing the tactic, not a reason to
  distort the Battle around it, and a player who forks well across a Conflict banks a card
  they would not otherwise have.
- Together with ADR-0517 the board now pays for two distinct things, and both arrive through
  the same notice channel: a log line, a rising marker over the cell, and the `gold` cue.
  A third would want a shared name for the category before it wants its own machinery.
