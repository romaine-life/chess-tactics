---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)"
partially_supersedes:
  - "[ADR-0368](0368-conflicts-open-with-bona-vacantia-instead-of-closing-with-loot.md)'s lipsanon offer at the Run's opening screen"
---

# ADR-0516: The Run opens with a formation-card grant, on a band deep enough to turn

## Context

[ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md) made player
arrangement the sole Deployment rule and sold quarter-turn rotation as the reason the offer catalog
collapsed from 720 labeled arrangements to 272 identities. Two things stopped Battle 1 from
demonstrating any of it.

**Rotation had never worked for a formation wider than the band was deep.** A seat's row was
computed as an *index into the authored lane list* rather than a board row, and that list was itself
clamped to its two lowest rows. Standing a three-wide formation up asks for a third row, the index
ran off the end of a two-element array, and the whole placement option was discarded. Every
authored Run level is two rows deep, so at 90 and 270 degrees the option count was zero everywhere.
Measured on the live levels: `ppp` offered 8 placements flat and 0 vertical.

**Battle 1 had nothing to arrange.** The Run's opening screen granted a lipsanon, so the player
reached the first Deployment holding only His Grace — a fixed 2x2 L. A screen whose entire subject
is deliberate placement opened by handing the player one shape and, on the opening level's
four-cell zone, exactly one legal anchor for it.

## Decision

- **A deployment band is as deep as its level authored it.** `authoredDeploymentLaneRows` returns
  every player-spawn row rather than the two lowest, and a seat's row is `anchorRow + offset`, in
  board coordinates. Legality stays where it already was — the deployment pool rejects anything off
  the band — so a level that wants a three-row band gets one by authoring it, and a two-row band
  genuinely cannot stand a three-wide formation up. That is now level geometry, not a code clamp.
- **The Run's opening Bona Vacantia grants a formation card instead of a lipsanon.** Three offers,
  one taken, mandatory, free; taking one opens Battle 1's Deployment exactly as taking the lipsanon
  did. The grant is admitted through the same path Adlectio uses, so its units, seats and card
  sequence are indistinguishable from a purchased formation.
- **The grant draws from card value 4 through 6** — 65 of the 272 offer cards, 60 of them Common,
  mostly one minor piece behind three Pawns. Low enough that the opening card is a formation to
  solve rather than a finished answer, high enough to be more than a lone Pawn.
- **The two offer lists are exclusive.** `RunVacantiaState.kind` decides: `opening` carries
  `cardOffers` and no `offers`; `post-battle` keeps lipsana and no `cardOffers`. Both the crafter
  and the server's active-Run validator enforce that split, and the value band is read from the
  model by both so it cannot drift.
- **RunSaveVersion advances to 31.** A document still sitting on the opening screen is dealt the
  card offers its own seed would have produced. A Run that already left that screen keeps the
  lipsanon it took: the grant is not retroactive, and that was a real choice.

## Consequences

- Battle 1 opens with His Grace plus a real formation on a six-wide, three-deep band. `ppp` there
  now offers 12 placements flat and 6 vertical, so the opening Battle teaches rotation by making it
  matter rather than by explaining it.
- Battles 3 and 4 still offer zero vertical placements for a three-wide formation. That is correct
  and now legible: their bands are two rows deep. Whether they should be deeper is a level decision
  this ADR deliberately leaves open.
- The Run's opening no longer front-loads a lipsanon. ADR-0368's argument for lipsana arriving
  before the shop still holds for every later Conflict, which is where they now begin.
- `loot=` is refused at the Run's opening craft, because the opening no longer offers lipsana.
