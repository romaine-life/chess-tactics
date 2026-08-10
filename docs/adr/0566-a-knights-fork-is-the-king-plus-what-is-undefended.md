---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0565](0565-a-knights-fork-is-paid-by-the-prong-and-accelerates.md)"
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0566: A Knight's fork is the King plus what is undefended

## Context

ADR-0565 paid `knight-fork` by the COUNT of enemy units a Knight strikes from the square it just
moved to, on the reasoning that a Knight's scattered squares cannot be answered two at a time. The
count was the whole rule: any two enemy units paid 5, three paid 15, and so on.

The count is not the deed. A Knight that lands among a chain of mutually defended Pawns strikes
three units and wins nothing — they leave every one of them where it stands, and the Knight that
takes one is taken straight back. Worse, nothing in that position forces the enemy to answer at
all: they get a free move to do whatever they were going to do, and the Knight collects at most an
even trade. ADR-0565 was already uneasy about this in the safety clause it wrote for the FORKER;
the same reasoning applies to the prongs, and it was not applied there.

The owner named the fix directly: *"the knight's fork bonus should only apply to the king combined
with undefended pieces."*

## Decision

- **A prong is something the enemy CANNOT ANSWER, and there are exactly two kinds.** The enemy
  King, because it must move — that is the whole force of a check. And an UNDEFENDED enemy unit,
  because the move the check costs them is the free move that collects it. Nothing else counts.
- **The King is required.** Breadth without a check pays nothing, however many units are struck:
  with no check the enemy answers the one threat that matters to them and keeps the rest. A Knight
  striking four undefended Pawns and no King now earns nothing, which is correct — it is one Pawn,
  next turn, if they leave it there.
- **A DEFENDED unit is no prong at all** and is not counted. Taking it is answered, so the check
  bought nothing. This is where the two forks part company, deliberately: ADR-0527's royal fork
  still does not ask whether its victim is defended, because a Rook won for a Knight is worth the
  exchange even when they take back. Quality survives a recapture; count does not.
- **The King is counted as one of the prongs it requires**, so the price ladder of ADR-0565 is
  untouched: two prongs is the King and one free unit at 5, three prongs is the King and two at 15,
  and so on. The plain fork still lands under the royal fork's 10 and three prongs still passes it,
  which was the whole reason that rate is five.
- **"Undefended" is the plain board reading** — no other living unit of that side attacks the
  square it stands on. Their King counts as a defender. Attack geometry, not legality: a defender
  pinned against its own King still counts, because the question is what guards the square rather
  than what the position would survive. `unitIsDefended` joins `enemiesAttackedBy` and
  `royalForkVictim` in `core/rules`, reading boards through the same `attacksSquare` geometry check
  detection uses, so a defence here is an attack there. Board law never consults it.
- **`forkHolds` is unchanged and still asked**, of the fork rather than of an entry. The two
  questions are different halves of the same one: `forkHolds` asks whether the enemy can profitably
  take the KNIGHT, and this asks whether the Knight can profitably take a PRONG.
- **The two forks remain one ladder**: the dearer pays and the other stands down. A Knight striking
  the King and an undefended Rook is both a royal fork at 10 and a two-prong Knight's fork at 5, so
  the royal one pays. Add a second free unit and the count overtakes it at 15.
- No RunSaveVersion, save shape, database migration, or board law changes. The catalog entry's
  own sentence and the Enchiridion diagram are rewritten to the new shape — the drawn board is now
  a King in check beside an undefended Rook and Bishop, because an example that does not earn the
  deed teaches the wrong rule harder than no example would.

## Consequences

- **`knight-fork` becomes a strictly royal deed**, and the catalog now has two entries about one
  geometry asking two honest questions: the royal fork asks how GOOD the second prong is, and the
  Knight's asks how MANY free ones came with the check. Neither is a special case of the other, and
  the test that pins them apart is the defended Rook — no Knight's fork, still a royal one.
- **The bounty is much rarer, and that is the point.** Two ordinary units at once was the commonest
  good Knight move there is (ADR-0565's own closing line); the King plus a hanging piece is a real
  tactic a player has to see. The 5 at the bottom of the ladder is now paid for something worth
  noticing rather than for standing in a busy part of the board.
- The AI is unaffected: nothing in `core/ai` reads Manubiae, and `unitIsDefended` is a new reader
  no move generator, adjudicator, or position key consults.
- Cost is bounded and lower than it looks: `unitIsDefended` runs once per non-King unit a Knight
  strikes, and only on a Knight move that already checks the enemy King. It is plain attack
  geometry with no `applyMove` in it, unlike the one ply `forkHolds` spends per enemy capture.
- A Run holding gold earned under ADR-0565's reading keeps it. Nothing is recomputed backwards;
  Manubiae are paid at the moment the board commits and banked.
