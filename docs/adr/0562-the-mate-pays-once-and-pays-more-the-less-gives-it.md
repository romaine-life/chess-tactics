---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
  - "[ADR-0543](0543-a-mate-is-paid-for-the-army-it-did-not-have-to-take.md)"
  - "[ADR-0561](0561-a-pawn-that-mates-by-arriving-is-paid-and-the-underpromotion-more.md)"
---

# ADR-0562: The mate pays once, and pays more the less that gives it

## Context

The owner asked for a Manubium on the mating unit itself: *"delivering mate with any unit other
than a queen should also be a bonus, increased as material gets lower."*

Every Manubium before this one prices something about a MOVE. This one prices something about a
UNIT — what is standing there at the end, giving the mate. That difference matters twice over.

First, it is the only Manubium that is nearly always available. Every Battle is won by checkmate
(ADR-0543: the win rule wants the enemy King captured, which legal-move generation never permits,
so mate is the only ending a Battle has), so every Battle that is won has some unit delivering it.
The other eight entries are things a player may go a whole Run without landing.

Second, it collides with the three entries that already describe a mate. ADR-0540 gave smothered
mate, ADR-0561 gave promotion mate and underpromotion mate, and this adds a fourth. Left to stack,
a Knight underpromotion into a smothered mate would collect all four for one mate.

## Decision

- **`humble-mate` pays for the distance the mating unit falls short of a Queen**, at three gold a
  point: a Rook 12, a Bishop or Knight 18, a Pawn 24. A Queen is 9, so **her mate comes out at
  exactly nothing** — "anything but a Queen" is what the arithmetic SAYS rather than a clause
  bolted onto it, which is the same shape `RUN_ROYAL_FORK_MIN_VICTIM_VALUE` has (derived from the
  Rook rather than written as a bare 5).
- **Three a point, and in the low band.** An advantageous capture and Deditio each pay two a
  point and are counted many times over; this is counted once per Battle at most, so it takes the
  slightly steeper rate. It still belongs at ADR-0540's ten-gold pole — *"the Run noticing
  something you were going to do anyway"* — because a Rook mate is simply how a Battle usually
  ends. The GRADIENT is where the teaching is: doubling from Rook to Pawn is what makes it worth
  looking for the Knight's mate instead of the Queen's.
- **THE MATE PAYS ONCE.** Four entries now describe a checkmate — what the mating unit is worth,
  what the King's own men were doing around it, and whether that unit arrived by promoting — and
  they are rungs of one ladder in exactly the sense ADR-0540 gave the two checks: **a smothered
  mate IS a mate by a Knight, and an underpromotion mate IS a mate by the lesser piece the Pawn
  chose.** So the candidates are gathered and the DEAREST is paid, the rest standing down.
  `smotheredMateBy` moves out of the per-moved-piece loop and into that group to make this one
  decision rather than a push that races the others.
  Because every rung above the floor is dearer than the whole of the floor's range (50, 50, 60, 80
  against a top of 24), "the dearest pays" and "the most specific pays" are the same rule here
  rather than two that can disagree — which is deliberate, and a constraint on any future rung.
  Everything OUTSIDE the mate still stacks as before: a promotion that mates is paid alongside the
  check it discovered, and a capture that also forks is still both.
- **Paid on the LEAST valuable checker.** When two units mate at once, the deed is the smaller of
  them, and the marker seats on that unit's square.
- **This reads the piece's CURRENT type, where every other Manubium reads `promotedFrom`, and
  the divergence is the point.** What this entry rewards is a **creative mate** rather than the
  Queen mate that is the default ending of every game of chess. A Queen delivering mate is not
  special, and **it does not become special because the Queen used to be a Pawn** — the board at
  that moment holds a Queen doing the most ordinary thing a Queen does. So `boardPieceValue` is a
  separate reader with its own name, not a flag on `manubiaeUnitWorth`.
  `manubiaeUnitWorth` answers a genuinely different question — *what did this cost the Run* — which
  is why ADR-0540 rightly prices a queened Pawn as a Pawn on both sides of a CAPTURE: the roster
  has no promotion concept and hands her back as a Pawn next Battle. Both readers are correct for
  their own question and neither generalizes to the other.
  **This clause has already been reversed once and reverted, so it is worth saying what the
  tempting argument is and why it fails.** The argument runs: trading material down to a Pawn
  advantage, passing the Pawn and walking it home is a lean, skilful win, and pricing that Queen at
  nine pays nothing for the whole endgame. Every part of that is true, and it is still not what
  this entry is for. This one pays for the SHAPE OF THE MATE — what is standing there at the end —
  and a grind-out that finishes with a Queen has no unusual shape however it was reached.
- **A grind-out is a player choice, and it stays unrewarded on purpose.** Trading everything off,
  converting a material edge and queening a passed Pawn is a real choice a player makes, and the
  Run pays nothing for it. That is not an oversight for a later entry to close: *a grind-out is not
  desirable, and it means the level was not good enough to force interesting decisions.* Paying for
  it would pay for the level's failure and point players at the levels that fail. So the remedy for
  a Battle that grinds is the BATTLE — its material, its terrain, its objective, its clock — and
  not a position-shaped bounty ("won with little on the board", "won an endgame", "won from
  behind"). ADR-0543's Deditio already prices the symptom, which is why it is priced DOWN rather
  than merely priced differently.
- **The King is refused explicitly.** Its zero on the piece scale is a sentinel for "never
  bought", so left to the formula it would read as the humblest unit on the board and pay the
  most. A King may not give check at all, so this cannot arise — the scale is simply not asked to
  be lucky about it.
- **The Enchiridion entry is drawn as a PAWN's mate**, the top of the ladder and the least likely
  thing a player will ever see: four of the King's own men seal it in, the fifth square is held by
  the mating Pawn, and a second Pawn defends that Pawn so the King cannot take it. The section's
  "How they add up" note gains the pays-once rule beside the existing one for the two checks.
- Board law is untouched, and no RunSaveVersion, save shape, or database migration changes.

## Consequences

- **The Run's floor rises on nearly every Battle.** This is the first Manubium a player collects
  as a matter of course rather than as a flourish, so it reads less like a bounty and more like a
  standing term of the economy — 12 gold on the ordinary Rook mate, against a Battle reward near
  80. That is the intent, and the pays-once rule is what keeps it from compounding: the end of a
  Battle can now pay at most 80, not 80 plus 50 plus 18.
- **It points the same way as Deditio (ADR-0543) rather than against it.** Deditio pays for the
  enemy force still standing at the mate, rewarding a sharp early finish. This ladder's FLOOR — a
  Rook's 12 — is reachable at the end of a long endgame, but its TOP is not: the Knight, Bishop and
  Pawn mates at 18 and 24 need the enemy King boxed in by its own men or caught in a sharp
  position, and that happens with force still on the board. So the reward is concentrated where
  Deditio's is, and a grind-out collects the least from both. That is the intended shape, per the
  clause above.
- A player who queens a Pawn now has a reason not to mate with her. That is a strange sentence and
  a good one: the game is teaching that the last move is a choice, not a formality.
- `verify:manubiae` can reach this entry more easily than any other, since every won Battle offers
  it — but it still cannot be reached from a CRAFTED position, because craft produces untouched
  openings whose armies are not in contact and the gate refuses to manoeuvre toward a deed. That
  limit is the gate's reachable subjects, not this entry.
