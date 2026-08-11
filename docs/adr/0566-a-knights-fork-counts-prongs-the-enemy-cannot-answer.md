---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0565](0565-a-knights-fork-is-paid-by-the-prong-and-accelerates.md)"
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0566: A Knight's fork counts only prongs the enemy cannot answer

## Context

ADR-0565 paid `knight-fork` by the COUNT of enemy units a Knight strikes from the square it just
moved to, on the reasoning that a Knight's scattered squares cannot be answered two at a time. The
count was the whole rule: any two enemy units paid 5, three paid 15, and so on.

The count is not the deed. A Knight that lands among a chain of mutually defended Pawns strikes
three units and wins nothing — the enemy leaves every one of them where it stands, and the Knight
that takes one is taken straight back. ADR-0565 was already uneasy about this in the safety clause
it wrote for the FORKER; the same reasoning applies to the prongs, and it was not applied there.

The owner named the fix, and then narrowed it correctly: *"the knight's fork bonus should only apply
to the king combined with undefended pieces"*, and then *"two undefended pieces is still good. you
can swap a king with an undefended piece in the formula."*

## Decision

- **A prong is something the enemy CANNOT ANSWER, and there are exactly two kinds.** Their King,
  because it must move — that is the whole force of a check. And an UNDEFENDED unit, because the
  enemy gets one move and it cannot save two of them.
- **The two kinds are INTERCHANGEABLE.** The King and one free piece, or two free pieces, are the
  same fork of two and pay the same 5. Neither kind is required and neither is worth more: a Knight
  hitting two hanging pieces wins one of them, and a Knight checking the King beside a hanging
  piece wins that one. What is being paid for is the enemy's inability to answer, not the presence
  of a check.
- **A DEFENDED unit is no prong at all** and is not counted. Taking it is answered, so it costs the
  enemy nothing to leave it standing. This is where the two forks part company, deliberately:
  ADR-0527's royal fork still does not ask whether its victim is defended, because a Rook won for a
  Knight is worth the exchange even when they take back. Quality survives a recapture; count does
  not.
- **The King is exempt from that question rather than special-cased into it.** A King cannot be
  taken at all, so "is it defended" does not apply — one clause in the filter, not a second branch.
- **ADR-0565's price ladder is untouched**, and now reads as prongs rather than bodies: two prongs
  at 5, three at 15, four at 30. The plain fork still lands under the royal fork's 10 and three
  prongs still passes it, which was the whole reason that rate is five.
- **"Undefended" is the plain board reading** — no other living unit of that side attacks the square
  it stands on. Their King counts as a defender. Attack geometry, not legality: a defender pinned
  against its own King still counts, because the question is what guards the square rather than
  what the position would survive. `unitIsDefended` joins `enemiesAttackedBy` and `royalForkVictim`
  in `core/rules`, reading boards through the same `attacksSquare` geometry check detection uses, so
  a defence here is an attack there. Board law never consults it.
- **`forkHolds` is unchanged and still asked**, of the fork rather than of an entry. The two are
  different halves of one question: `forkHolds` asks whether the enemy can profitably take the
  KNIGHT, and this asks whether the Knight can profitably take a PRONG.
- **The two forks remain one ladder**: the dearer pays and the other stands down. A Knight striking
  the King and an undefended Rook is both a royal fork at 10 and a two-prong Knight's fork at 5, so
  the royal one pays. Add a second free unit and the count overtakes it at 15.
- No RunSaveVersion, save shape, database migration, or board law changes. The catalog entry's own
  sentence and the Enchiridion diagram are rewritten to the new shape — the drawn board is now one
  prong of each kind, a King in check beside an undefended Rook and Bishop, because an example that
  does not earn the deed teaches the wrong rule harder than no example would.

## Consequences

- **The catalog now has two fork entries about one geometry asking two honest questions**: the royal
  fork asks how GOOD the piece beside the King is, and the Knight's asks how MANY things it hits
  that the enemy cannot answer. Neither is a special case of the other, and the test that pins them
  apart is the defended Rook beside the King — no Knight's fork, still a royal one.
- **The bounty gets harder to earn by accident without getting rare.** A Knight landing where two
  enemy pieces happen to stand no longer pays; a Knight landing where two *hanging* pieces stand
  still does, and so does the King-and-a-hanging-piece tactic. What was removed is exactly the
  case that wins nothing.
- The AI is unaffected: nothing in `core/ai` reads Manubiae, and `unitIsDefended` is a new reader
  no move generator, adjudicator, or position key consults.
- Cost is bounded and lower than it looks: `unitIsDefended` runs once per non-King unit a Knight
  strikes, and it is plain attack geometry with no `applyMove` in it, unlike the one ply `forkHolds`
  spends per enemy capture.
- A Run holding gold earned under ADR-0565's reading keeps it. Nothing is recomputed backwards;
  Manubiae are paid at the moment the board commits and banked.
