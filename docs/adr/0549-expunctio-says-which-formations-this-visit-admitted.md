---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0443](0443-athetize-is-the-card-action-within-expunctio.md)"
---

# ADR-0549: Expunctio says which formations this visit admitted

## Context

Expunctio lists every card the Run holds, and every tile in that gallery looks the same whether
the card was carried into the Sectio or bought minutes earlier at the same visit's Adlectio. The
distinction is not cosmetic: **Reset Sectio restores the complete visit**, so a card this visit
admitted can be handed back for nothing, while a card the visit opened holding can only leave
through Athetize, at the printed Expunctio fee.

That made the one comparison the screen exists to support unavailable. A player deciding between
striking a formation and resetting the visit had to remember which cards the visit had brought in,
because nothing on the tile says so — the fee is computed from card value and attached units, so a
just-bought card and a long-held one of the same composition print the same number. The
information was already in the document and simply not shown.

`RunOwnedCard.acquiredAfterBattleIndex` looks like the answer and is not. It numbers the Sectio a
card came from, which a crafted or migrated Run rewrites (craft adlects held cards at the earliest
legal point, so a Run crafted at Battle 4 holds cards stamped 0), and it cannot distinguish this
visit's Adlectiones from what the visit opened holding once those numbers have been renormalized.

## Decision

- `sectioAdmittedCardIds(run)` is the single answer to "what did THIS visit admit": the cards held
  now, minus the cards in `RunSectioState.entrySnapshot`. The entry snapshot is the authority
  because it is the same record Reset Sectio restores from, so the mark and the reset can never
  disagree. An absent or empty snapshot yields nothing — no Run holds zero cards, so an empty one
  means there is no record to compare against, not that everything is new.
- The struck card is included. A formation admitted and then athetized by the same visit is still
  the visit's doing, and Expunctio shows that record beside the cards still held.
- The Expunctio tile prints **Adlected this visit** in its status line, answering ADR-0443's
  *Athetized this visit* in the same register. It is a clause of the existing line rather than a
  new row or a decorated badge, and it carries the copy's own ink against that line's muted text
  rather than introducing a colour to the Run's palette.
- The mark is presentation over existing state. Nothing is written, no field is added to the Run
  document, and `RunSaveVersion` does not move.

## Consequences

- The choice between striking one formation and resetting the visit is legible on the screen where
  it is made, instead of depending on what the player remembers buying.
- A card bought and then struck in one visit reads as both, which is the whole truth about a round
  trip Reset Sectio would refund entirely.
- Any later surface that lists held cards during a Sectio — the Chartulary above all — can ask the
  same function rather than deriving a second, divergent answer from acquisition numbers.

## More Information

- [Expunctio removes one card per Sectio](0407-expunctio-removes-one-card-per-sectio.md)
- [Expunctio is a card-first gallery](0442-expunctio-is-a-card-first-gallery.md)
- [Athetize is the card action within Expunctio](0443-athetize-is-the-card-action-within-expunctio.md)
