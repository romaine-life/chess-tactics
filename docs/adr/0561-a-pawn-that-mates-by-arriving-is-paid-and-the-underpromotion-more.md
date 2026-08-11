---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
  - "[ADR-0543](0543-a-mate-is-paid-for-the-army-it-did-not-have-to-take.md)"
---

# ADR-0561: A Pawn that mates by arriving is paid, and the underpromotion more

## Context

ADR-0540 named the Manubiae category, gave it one catalog, one payment path and one page in the
Enchiridion, and closed by listing what had been deliberately held back — *"absolute pin, skewer,
non-royal fork, underpromotion, trapped piece"* — *"to see these six in play first, not because
they do not fit."*

The owner asked for two of that list, together, as the next pair: a promotion that delivers
checkmate, and an underpromotion that delivers checkmate, with the Bishop and the Knight paying
more than the Rook.

Both survive ADR-0540's two filters without argument. **Board shape**: a promotion is defined by
the square a Pawn reaches, and this game already authors those squares per level, so nothing here
is anchored to an 8x8 rank. **Detectability without search**: the promotion announces itself as a
`promoted` event, and mate is the position the committed board is already in — no opponent reply
is guessed and no player intent is inferred.

They are also live content rather than an aspiration. Every Run battle is built by
`war/store.ts`, which injects a `run-player-promotion` zone and its promote event into every
level in the War, with no `choices` restriction — so all four pieces are offered by the picker in
every Battle a Run plays. There is no Run position where a Pawn can reach the far rank and be
denied the Knight.

## Decision

- **Two catalog entries, at the top of the ladder.** `promotion-mate` pays 50, joining en passant
  and smothered mate at the pole ADR-0540 described as *"worth going out of your way for, and you
  almost never can"*. `underpromotion-mate` is scaled by the piece the Pawn chose: **60 for a
  Rook, 80 for a Bishop or a Knight**.
- **The ladder is what each choice asks of the position, and the chess is exact.** A Rook or a
  Bishop can never mate where a Queen would not: standing on the same square the Queen attacks
  every square the Rook does and every square the Bishop does, so any mate they deliver she
  delivers too. Choosing one is style — the player saw a lesser piece finish the job and took it —
  and once the mate is there, taking a Rook instead of a Queen costs nothing, because the Battle
  ends either way. That is why the Rook sits only just above an ordinary promotion mate.
  The Bishop is dearer because a Bishop mate needs a far narrower shape than a Rook mate: one
  colour of diagonal, and every other flight square answered by other men.
  **Only the Knight can mate where the Queen cannot**, because the Knight's move is the one thing
  she does not have. That is the underpromotion every puzzle book prints and the only one a
  position can genuinely require. It is paid alongside the Bishop rather than above it: what the
  two ask of a position is nothing alike, and ranking them against each other would be inventing a
  difference rather than recording one.
- **An underpromotion mate pays INSTEAD of the promotion mate, not on top.** They are rungs of one
  ladder in exactly the sense ADR-0540 gave the two checks: every underpromotion mate *is* a
  promotion mate, so the better rung pays and the other stands down. Everything else still stacks —
  a Knight that promotes into a smothered mate earns both, and a Pawn that promotes by capturing a
  Rook earns the advantageous capture as well.
- **The promoted unit must be among the checkers.** A Pawn that queens while some other unit
  delivers the mate has not mated by promoting; that check is a discovered one and is already paid
  as the different thing it is. Being *among* the checkers is the bar rather than being the only
  one, so a promotion that mates as half of a double check still counts — it is still the arriving
  piece that ends the Battle.
- **Mate is read, not searched.** `kingCheckers` is already the committed board's answer to
  "is the enemy King attacked", and `sideHasLegalMove` is the same "no legal action" expression the
  canonical adjudicator uses (ADR-0059), so this cannot call a position mate that the Battle does
  not. `manubiaeEarnedBy` computes the checker list ONCE and both the check shapes and the mate
  read it.
- **The scaled entry's own words are written from its rates.** `priceNote` is built from
  `RUN_UNDERPROMOTION_MATE_TENTHS` rather than typed beside it, so the sentence a player reads in
  the Enchiridion cannot drift from the gold they are handed.
- **The Enchiridion gains both entries**, each with a real position drawn by the Battle renderer,
  as ADR-0540 requires. The underpromotion diagram is drawn as the Knight case on purpose: on that
  board a **Queen** on the promotion square would not even be giving check, so the picture is the
  reason the entry exists rather than an illustration of it. That section's "How they add up"
  note also corrects two stale numbers — it still read `3` and `2` for the two checks, from before
  ADR-0547 made the stored tenth the gold, while the cards beside it showed 30 and 20.
- **Board law is untouched.** Nothing here consults a move generator, an adjudication path or a
  position key, and a Skirmish or campaign level outside the Run economy pays nothing. No
  RunSaveVersion, save shape, or database migration changes.

## Consequences

- The Run now pays for a Pawn walk, which nothing in the economy did before. Deditio (ADR-0543)
  pays for the enemy force still standing at the mate and a promotion mate arrives late, so these
  two rewards pull against each other by construction: the slow win that walks a Pawn home banks a
  smaller Deditio. That is a genuine choice between two ways of ending a Battle rather than a
  conflict to be resolved, and it is the first time the Run has offered one.
- The 80 at the top of the ladder is the largest single Manubium in the game and approaches a whole
  Battle's own reward. It is placed there because a mating Knight promotion is the rarest thing a
  player can do on one of these boards, not because the economy needed a bigger number; if it
  proves too loud in play, the rate is one constant.
- `verify:manubiae` covers `promotion-mate` and cannot cover `underpromotion-mate`. The gate
  enumerates legal moves and applies each with the board's default promotion, which is the Queen,
  so a Pawn arriving on the promotion rank is only ever planned as a Queen there. Choosing
  otherwise happens in the promotion picker after the move is authored, which is a different gate;
  the payment path itself is shared, through the same transform and the same reader.
- The list ADR-0540 held back is down to four: absolute pin, skewer, non-royal fork, trapped piece.
  Underpromotion leaves it having brought a companion nobody had listed, which is the pattern worth
  noticing — the motifs that port to this game are the ones defined by local relationships between
  pieces, and "what a Pawn becomes when it arrives" is as local as they come.
