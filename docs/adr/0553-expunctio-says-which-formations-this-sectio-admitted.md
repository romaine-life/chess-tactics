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

# ADR-0553: Expunctio says which formations this Sectio admitted

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
- The Expunctio tile prints **Adlected this Sectio** — the visit named by the movement the player
  is standing in, not by a generic "visit" — beside a glyph of the admission. It carries the tile's
  own ink rather than the muted register the supporting labels use, because it reports state
  instead of labelling a field.
- The line says nothing about the price. A coin stood beside the words while the mark's art was
  undecided, and it said only that gold was involved, which the fee directly beneath the line
  already says exactly. A transaction mark is worse than redundant: the fee paints `lose-gold`'s
  arrow, so a second arrowed mark on one tile reads as a second price, and `gold-gained` says the
  opposite of what happened.
- The admission gets a new slot, `ui/run/sectio/adlectio-mark.png` (`ui-kit` domain, `icon` role,
  decorative), because the kit had no glyph for it — `game/adlected` belongs to the retired
  unit-ability vocabulary and depicts pikes. The slot is named for WHAT IT MARKS, not for what it
  draws, because what it should draw is an open question with two live answers: the hand that
  handed the gold over, or the hand that took the card the gold bought. Both audition in the one
  seat, so choosing between them is choosing an image and not a code path.
- The seat draws nothing at all until a candidate is installed, rather than reserving an empty box
  for a mark that says nothing yet (ADR-0318); the line is then the words alone. The chosen glyph
  is a hand pulling the card toward the player, which is the act the words name — the reason the
  coin could go.
- Candidates are auditioned in the Studio's **Adlectio Mark** category, which mounts every one of
  them in this exact line — the same `RunAdlectioMarkLine` the tile renders, not a lookalike — on
  one page, and installs the chosen one. A review surface is a Studio category reached by clicking
  (ADR-0058); it is never a review parameter bolted onto a player route. The Run route reads no
  such parameter for this mark, and the guard in `runChromeHierarchy.test.ts` fails if one appears.
  One page also means one comparison: an address per candidate makes the owner do the navigating,
  which is the work the surface exists to do.
- Installing one needs a typed backend projection, because `ui-kit` candidates are bridge-only by
  default. `adlectioMarkMediaIssue` is that projection, and it states the contract the seat depends
  on: the bytes are TRIMMED TO THEIR OWN INK. The seat draws with `contain`, which scales the
  canvas, so transparent margin comes straight off the glyph and an untrimmed mark silently draws
  smaller than the coin beside it. No fixed dimensions — the candidates are hands, cards and coins,
  and forcing a square would reintroduce the padding the ink-box rule exists to reject.
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
