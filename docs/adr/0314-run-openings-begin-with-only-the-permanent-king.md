---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0316](0316-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s restoration of two free starting Pawns"
  - "[ADR-0315](0315-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s retirement of draft-phase normalization"
partially_supersedes:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)'s three free starting Pawns"
  - "[ADR-0313](0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)'s retained three starting Pawns"
---

# ADR-0314: Run openings begin with only the permanent King

## Context and Problem Statement

ADR-0313 made the opening card a real purchase, but retained the original three
free Pawns. Those guaranteed units still anchor every opening to the same roster
and blunt the variation created by the three-card deal. The owner wants the
selected card to determine the complete non-royal starting party.

## Decision Drivers

- The opening card should materially determine the first-Battle roster.
- A cheap card should trade immediate army strength for carried gold without a
  hidden three-Pawn floor.
- The King must retain its permanent, unsellable Run identity.
- Already committed Run rosters must not be rewritten by document normalization.

## Considered Options

- Keep the King and three free Pawns.
- Keep the King and reduce the free Pawns to one.
- Begin with only the permanent King before the card purchase.

## Decision Outcome

Chosen: **begin with only the permanent King, then add every non-King opening
unit from the one purchased card.**

- A fresh Run's pre-purchase army contains exactly `run-king`; it contains no
  free Pawns or other non-King units.
- The Run still begins with 9 gold and three seeded, persisted, distinct-valued
  card offers under ADR-0313. Buying exactly one card supplies the complete
  non-King starting party, and unspent gold still carries forward.
- Pawn numbering begins at one when the first purchased card supplies a Pawn.
- Active Run format 7 owns the King-only opening. When an older document is
  still at the unchosen opening, normalization removes only legacy Pawns whose
  source is `starting` and resets the next Pawn number. A format-5 opening also
  receives ADR-0313's 9-gold deal; a format-6 opening keeps its existing budget
  and deal rather than receiving the budget twice.
- A Run that already chose its opening card keeps its complete committed army,
  including any legacy free starting Pawns.
- Card Layout exposes the opening party as `King + selected card` alongside its
  adjustable opening seed and offers.

### Consequences

- Good: the bought card now controls all non-royal opening units, substantially
  increasing roster variety.
- Good: economy-versus-force choices are honest because no free three-Pawn
  baseline sits outside the displayed card value.
- Good: committed Runs remain stable across the format change.
- Cost: a one-gold opening card can lead to a King-and-Pawn first roster, so
  first Battles must support the full opening range promised by ADR-0313.
- Cost: an uncommitted legacy opening loses its three free Pawns on first
  normalization.

## More Information

- [ADR-0313](0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)
- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
