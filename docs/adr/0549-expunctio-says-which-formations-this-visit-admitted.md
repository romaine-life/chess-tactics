---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0446](0446-expunctio-tiles-use-shell-surface-and-oak-actions.md)'s \"status, attached units, fee, and action remain\" clause"
refines:
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
  - "[ADR-0442](0442-expunctio-is-a-card-first-gallery.md)"
  - "[ADR-0443](0443-athetize-is-the-card-action-within-expunctio.md)"
  - "[ADR-0511](0511-held-cards-are-immutable-formations.md)"
---

# ADR-0549: Expunctio says which formations this visit admitted

## Context

Expunctio lists every card the Run holds, and every tile in that gallery looked the same whether
the card was carried into the Sectio or bought minutes earlier at the same visit's Adlectio. The
distinction is not cosmetic: **Reset Sectio restores the complete visit**, so a card this visit
admitted can be handed back for nothing, while a card the visit opened holding can only leave
through Athetize, at the printed Expunctio fee.

That made the one comparison the screen exists to support unavailable. A player deciding between
striking a formation and resetting the visit had to remember which cards the visit had brought in,
because nothing on the tile said so — the fee is computed from card value and attached units, so a
just-bought card and a long-held one of the same composition print the same number. The
information was already in the document and simply not shown.

Meanwhile the companion column beside each face was full of text that said nothing the tile did not
already say. **"4 attached units"** is left over from the era when a seat could be emptied one unit
at a time; ADR-0511 made a held card one immutable formation, so the count reports something the
player cannot act on. The card's **name** was repeated beside a face that prints it — the exact
duplication ADR-0446 removed once and which had quietly returned. **"Athetize removes this card and
every attached unit as one formation"** restates, per tile, what the workspace's own rules copy
states once at the top. Three lines of vertical hierarchy, none of them decidable.

`RunOwnedCard.acquiredAfterBattleIndex` looks like the answer to the missing fact and is not. It
numbers the Sectio a card came from, which a crafted or migrated Run rewrites (craft adlects held
cards at the earliest legal point, so a Run crafted at Battle 4 holds cards stamped 0), and it
cannot distinguish this visit's Adlectiones from what the visit opened holding once those numbers
have been renormalized.

## Decision

- `sectioAdmittedCardIds(run)` is the single answer to "what did THIS visit admit": the cards held
  now, minus the cards in `RunSectioState.entrySnapshot`. The entry snapshot is the authority
  because it is the same record Reset Sectio restores from, so the mark and the reset can never
  disagree. An absent or empty snapshot yields nothing — no Run holds zero cards, so an empty one
  means there is no record to compare against, not that everything is new.
- The struck card is included. A formation admitted and then athetized by the same visit is still
  the visit's doing, and Expunctio shows that record beside the cards still held.
- The Expunctio tile prints **Adlected this visit**, answering ADR-0443's *Athetized this visit* in
  the same register. It carries the tile's own ink rather than the muted register the supporting
  labels use, because it reports state instead of labelling a field.
- The mark wears the installed gold coin (`ui/run/resources/gold.png`, through the shared
  `RunGoldIcon` and its review seam), not a transaction mark. The fee directly beneath it already
  paints `lose-gold`'s arrow, and a second arrowed mark on one tile reads as a second price;
  `gold-gained` says the opposite of what happened. The kit has no purchase glyph — `game/adlected`
  belongs to the retired unit-ability vocabulary and depicts pikes, not a payment — so the plain
  stack is the true and available statement: gold bought this record, at this visit.
- That mark is the *only* thing the companion says in words. The attached-unit count, the repeated
  card name and the per-tile restatement of the Athetize rule are deleted; what remains beside the
  face is the mark, the fee, and the action. The face is the sole title owner, as ADR-0446 said,
  and the workspace's rules copy is the sole statement of the rule.
- The mark is presentation over existing state. Nothing is written, no field is added to the Run
  document, and `RunSaveVersion` does not move.

## Consequences

- The choice between striking one formation and resetting the visit is legible on the screen where
  it is made, instead of depending on what the player remembers buying.
- A card bought and then struck in one visit reads as both — the mark above, *Athetized this visit*
  on its own disabled action — which is the whole truth about a round trip Reset Sectio would
  refund entirely.
- An ordinary carried-in formation now says nothing in words at all: its face, its fee and its
  action are the whole tile. Silence is the correct reading, because every state the removed lines
  described is still stated by the action beneath them.
- Any later surface that lists held cards during a Sectio — the Chartulary above all — can ask the
  same function rather than deriving a second, divergent answer from acquisition numbers.

## More Information

- [Expunctio removes one card per Sectio](0407-expunctio-removes-one-card-per-sectio.md)
- [Expunctio is a card-first gallery](0442-expunctio-is-a-card-first-gallery.md)
- [Athetize is the card action within Expunctio](0443-athetize-is-the-card-action-within-expunctio.md)
- [Expunctio tiles use shell surface and oak actions](0446-expunctio-tiles-use-shell-surface-and-oak-actions.md)
- [Held cards are immutable formations](0511-held-cards-are-immutable-formations.md)
