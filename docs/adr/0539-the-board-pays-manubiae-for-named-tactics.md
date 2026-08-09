---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
  - "[ADR-0517](0517-a-player-en-passant-pays-a-five-gold-bounty.md)"
  - "[ADR-0525](0525-a-run-change-inside-a-live-battle-cannot-be-silent.md)"
  - "[ADR-0527](0527-a-royal-fork-pays-one-gold.md)"
---

# ADR-0539: The board pays Manubiae for named tactics

## Context

ADR-0517 made the board pay for the first time — five gold for a player en passant — and
ADR-0527 added a second, one gold for a royal fork. Each arrived as its own constant, its own
pay function, and its own paragraph. ADR-0527 closed by saying exactly what this record is
for: *"A third would want a shared name for the category before it wants its own machinery."*

The owner asked for four more, and for a reference entry covering all of them: an advantageous
capture, a revealed check, a double check, and a smothered mate. That is no longer two special
cases. It is a category, and a category is a thing a player can be taught, so it needs a name,
one price list, one payment path, and one page in the Enchiridion.

Naming it also settles what belongs in it. The candidate space is the standard tactical-motif
taxonomy — the one every puzzle trainer publishes — but most of it does not survive the trip to
this game. Two filters apply:

- **Board shape.** These boards are not 8x8. They have authored dimensions, terrain, walls,
  water and obstacles. Every motif anchored to rank-and-file geometry — back-rank mate,
  Anastasia's, Arabian, Boden's, hook, dovetail — stops meaning anything here. The motifs that
  port are the ones defined by *local relationships between pieces*, which read the same on any
  board. Smothered mate ports precisely because "hemmed in by its own men" is local; its
  cousins do not.
- **Detectability without search.** A deed is payable when the committed board plus the move
  that produced it settles the question. Deflection, decoy, clearance, interference,
  zwischenzug, quiet move, sacrifice and zugzwang all need the opponent's best reply, or the
  player's intent, or both. Paying for a guess is worse than not paying.

## Decision

- The category is **Manubiae** — the Roman commander's cash share of what was taken in the
  field. Money for what you did on the board, in the register the Run already speaks. It names
  the things a Run pays for *doing*, as distinct from the Battle reward banked on exit
  (ADR-0220) and a lipsanon paying on acquisition.
- **One catalog, one payment, one notice.** `RUN_MANUBIAE` holds every entry with its name, its
  price and the sentence that earns it; `payRunManubium` is the only way the board moves the
  Run's gold. A caller passes a `ManubiumAward` describing what happened and never a number, so
  it cannot pay the wrong one. Adding a bounty is a row in the table plus a detection at the
  board seam — never a new path through the economy. `payRunEnPassantBounty` and
  `payRunRoyalForkBounty` are deleted into it; their two constants remain, derived from the
  catalog, because the royal-fork gate reads one.
- **The six, cheapest first.** Advantageous capture (0.2 gold per point of margin), royal fork
  (1), discovered check (2), double check (3), en passant (5), smothered mate (5). Prices sit
  between the two poles ADR-0517 and ADR-0527 set: five gold is worth going out of your way for
  and you almost never can; one gold is the Run noticing something you were going to do anyway.
- **An advantageous capture is scaled, not flat.** It is the one deed here a player lands
  constantly, and a single flat number is either too much for a rook taking a queen or too
  little for a pawn taking one. Two tenths per point of material won is exact in the gold scale,
  so no rounding rule exists: a pawn taking a queen banks 1.6, a rook taking a queen 0.8.
- **A unit is worth what it STARTED as.** `Piece.promotedFrom` is recorded by `applyMove` at the
  moment a promotion commits, and `manubiaeUnitWorth` reads it on both sides of the comparison,
  so a queened pawn is a Pawn whether it is capturing or being captured. This is not an
  exception invented for the bounty: the Run roster has no promotion concept at all and hands
  the pawn back as a Pawn next Battle, so this is the board agreeing with the economy that
  already exists. A King and an obstacle have no purchase price and yield no margin either way
   — the King's zero on the piece scale is a sentinel for "never bought", and reading it as
  worth would make every capture a King makes look advantageous.
- **A discovered check needs no before-and-after.** The enemy King cannot already have been in
  check on the player's turn, so any checker that is not among the pieces that just moved is a
  line this move opened. Castling emits a `moved` event for both king and rook, so a castled
  rook's check is an ordinary check — which is what chess calls it.
- **Double check pays INSTEAD of discovered check, not on top.** They are rungs of one ladder:
  a double check is a discovered check with the mover joining in, and paying both would be
  paying twice for one check. Every other combination stacks — a capture that also forks is
  both — which is already how en passant and the fork behave.
- **Smothered mate is kept literal.** A Knight, checking alone, on a King with no legal move
  left, with every in-bounds neighbouring square occupied by the King's *own* men. It is about
  men, not squares: a King sealed into a pocket by cliffs is trapped by terrain, not smothered,
  and does not pay. Off-board neighbours are allowed, which is what keeps the classic corner
  mate a corner mate. A fully hemmed King can only ever be reached by a Knight, so the only way
  to get a second checker is a second Knight — and then the King is answering two pieces, which
  is a double check that mates rather than a smothered mate.
- **The Enchiridion gains a `manubiae` section**, seated with Units and Terrain — the three
  sections about the board itself — ahead of the three about the Run's economy. Each entry
  states its price through the shared gold amount and shows the shape on a real board drawn by
  the Battle renderer, the way the Units section shows movement. It reads the catalog; it never
  restates a price.
- **Board law is untouched.** No legal-move generator, adjudication path or position key
  consults any of this, and a Skirmish or campaign level outside the Run economy pays nothing.
  `kingCheckers`, `sideHasLegalMove` and `smotheredMateBy` join `royalForkVictim` in
  `core/rules` and read boards through the geometry check detection already uses. The canonical
  adjudicator now calls `sideHasLegalMove` rather than keeping its own copy of that expression,
  so "no legal action" has one implementation (ADR-0059).
- No RunSaveVersion, save shape, or database migration changes. `promotedFrom` is a new optional
  field on a board piece whose absence reads as "never promoted".

## Consequences

- Undo reverses every Manubium exactly, with no special case — the checkpoint predates the move,
  so taking the move back takes the gold back and charges the ordinary one-gold Undo on top. No
  deed here is ever worth undoing for profit.
- Restart does not, and that farm stays open on the terms ADR-0517 set. It is now slightly
  wider, because a restartable position offering an advantageous capture is commoner than one
  offering an en passant. It is also worth less per cycle: at 0.2 a point, a Restart's three
  gold buys back fifteen points of margin, which no reproducible single capture reaches.
- The economy's floor moves. A player who trades well now earns a trickle across every Battle
  rather than only at the Sectio, which is the intent — but it is a trickle by construction: the
  whole of a typical Battle's advantageous captures is worth well under one eight-gold card.
- A discovered check that is *also* a royal fork is impossible by construction, since a fork is
  one piece's work and a discovery is two pieces'. They can never double-pay each other.
- Four of the six are things a competent player already does, so the Run now teaches by paying.
  That is the point of the Enchiridion entry: the price list is a curriculum.
- The motifs deliberately left out — absolute pin, skewer, non-royal fork, underpromotion,
  trapped piece — are all detectable with what is now in `core/rules` and cost a catalog row
  each. They were held back to see these six in play first, not because they do not fit.
