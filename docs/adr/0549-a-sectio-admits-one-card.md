---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)"
refines:
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)"
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)"
  - "[ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)"
---

# ADR-0549: A Sectio admits one card

## Context

ADR-0323 removed an inherited one-card-per-visit cap so every affordable dealt card could be
bought. Its two reasons were sound at the time: the cap was **not communicated** by the surface,
and the Shop was meant to read as one ordinary shop rather than a special ceremony.

What that leaves is an acquisition rate governed only by gold. A Run that wins two Battles
comfortably can clear an entire row, and clearing rows compounds — a larger army wins more
easily, wins pay more, and the next row is bought outright as well. The War's Battles are
authored against a roughly known force; the player's force does not arrive at Battle 5 anywhere
near where Battle 5 was written for. Every later Battle is then priced for someone else, and the
knobs left to fix it — card cost, victory gold, Battle difficulty — are all tuning a curve whose
shape is set by how many cards a visit can absorb, not by any of them.

A Sectio's other two transactions were already once-per-visit and had been for a long time.
Expunctio strikes one held card per Sectio; the After-Hours Key sells one lipsanon per Conflict.
The card row was the only part of the room that behaved like a shelf.

## Decision

**A Sectio admits exactly one card.** `SECTIO_ADLECTIO_LIMIT` is one, and `performAdlectio`
refuses a second admission however much gold remains — the refusal is the rule, not the price.
`sectioAdlectioSpent` is the single answer every surface asks.

The rule is **stated before the choice, not discovered by being refused**, which is the exact
failure ADR-0323 named — and it is said by the row itself rather than by anything that pops up:

- One line stands over the row for the whole visit, before and after the take: *They require
  compensation. Only one may be admitted.*
- When the admission is spent, a **padlock is laid on every surviving offer**. Together the two
  are the complete statement: you get one, and this is the one you took. There is no notice, no
  status box, and no copy that changes state.

The lock is the installed kit lock, `ui/kit/icons/lock.png` — the ordinary "you cannot have this"
glyph the app already uses. A second padlock drawn for one row would be a bespoke parallel
(ADR-0059). `RunCardPile` owns it as a third layer registered in the same seat as the face and
the back, sized as a share of the card so it stays an object laid on the card rather than a badge
stuck to a control, and inert so the disabled offer beneath it is still what the pointer meets.
It is decorative to assistive technology: the disabled control carries the state, and the
Adlectio announcement says the visit admits no other card.

Every unbought offer stays on the table, face up and unfaded — cards here are printed art, never
faded controls (ADR-0481), and what a player turned down is part of what they decided. The
offers become non-interactive; the bought seat still reveals its pile back, and a revealed back
carries no lock because it has no offer left to lock.

**Reset Sectio returns the admission to the visit.** It already restored the entry snapshot, so
one card is a decision rather than a misclick: the player may reset and admit a different one.

Quartermaster's Ledger keeps its exact meaning and gains weight rather than losing it — a fourth
revealed card is now a fourth candidate for the one admission, not a fourth thing to buy.

The save format is untouched. `adlectedCardOfferIds` remains the list of offers this visit
admitted, now holding at most one, so no RunSaveVersion moves and the persistence guard keeps
its structural checks. A document written under ADR-0323 that is sitting in a Sectio holding two
admissions stays legal and stays playable; it simply cannot admit another, and Reset clears it to
the new rule. Nothing is taken back from a Run that already bought under the old one.

`craft`'s `cards=` field still stages any number of held cards, because it withdraws each staged
offer — from the row and from `adlectedCardOfferIds` — before staging the next. Those are cards
the Run arrived holding, not one visit's shopping, and the two test fixtures that assemble a
holding Run do the same thing for the same reason.

## Consequences

- Army growth is one card per Battle plus what the Run is granted, so a War's authored difficulty
  curve and the player's force stay in the same units. This is the point of the change.
- Gold stops being a straight conversion into force. Unspent gold carries, Expunctio costs it,
  and the After-Hours Key wants it, so a Sectio is a real allocation instead of a checkout.
- A rich Run visibly leaves value on the table. That is intended: the row is a choice, and the
  cards passed over are the evidence of one.
- Card prices now tune *which* card is reachable rather than *how many*, which is a smaller and
  much better-behaved lever.
- ADR-0323's communication failure is answered directly rather than reintroduced: the count is on
  the surface before the decision, in the same sentence as the cost, and the closed state is a
  visible object on each card rather than a sentence the player has to read.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0323](0323-run-shops-allow-every-affordable-card-purchase.md)
- [ADR-0481](0481-sectio-offers-reveal-the-face-down-pile-beneath-them.md)
- [ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)
