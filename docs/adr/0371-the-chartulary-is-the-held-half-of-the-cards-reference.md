---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
partially_superseded_by:
  - "[ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)'s earliest legal crafted-card acquisition after Battle 1"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0335](0335-the-strategikon-is-a-run-wide-reference-not-a-battle-only-workspace.md)"
  - "[ADR-0364](0364-enchiridion-cards-is-a-terminal-gallery-with-no-fourth-column.md)"
---

# ADR-0371: The Chartulary is the held half of the Cards reference

## Context

The Strategikon carries two registers that read the live Run — the Martial Prosopography
(the current army) and the Lipsanotheca (held lipsana) — beside the Enchiridion, which reads
the game's fixed content. Cards had only the fixed half. `RunDocument.cards` has recorded
every purchase since the Run format gained it, and nothing in the game displayed it: a player
could see every card the deck *can* deal and no surface at all for the cards they *bought*.

A held card is the receipt for gold already spent. The Prosopography answers "what is my army";
nothing answered "what have I bought".

The first attempt at this section put an annotation box under every face listing the units that
card put in the army. The owner's response to it was "what is this?" — which is the answer. ADR-0364
had already retired exactly that kind of row from the reference gallery, on the grounds that a card
IS its own record and a prose row beside it duplicates the face. A held card is the same record.

## Decision

- The Strategikon gains a third Run register, **the Chartulary — Held Cards**, at
  `/play|/run/strategikon/chartulary`. It is an authored section scene like its two
  siblings, so section travel is a director transition, not a swap.
- It is the Enchiridion Cards gallery, and nothing more: the same section frame, the same
  filter row, the same gold-value coin groups, the same `RunCard` faces at the same size.
  One `CardGalleryFilters` component now serves both galleries so the two cannot drift.
  Grouping stays by gold value; `acquiredAfterBattleIndex` is deliberately NOT printed as a
  Battle number, because the opening Shop and the Shop after Battle 1 both record `0`.
- **A gallery item is the face and nothing else.** No annotation box, no unit roster, no
  acquisition caption. The difference between this gallery and the reference one is *which
  cards are in it* — that is the whole feature. Which units came off which card is a question
  this section deliberately does not answer; if it becomes worth answering, it belongs on the
  card (a face that knows it is owned), not in a second box beside it.
- A held card keeps the property it was bought with. `RunCard` accepts a `cardType` for a card
  that is no longer an offer, so an owned Pestiferous card keeps its frame and property strip,
  and the purchase-time captions ("target hidden", "chosen on purchase") belong to offers only.
- The Chartulary reads the Run; it never writes one. There is no sell, no discard, and no
  card-level action — the Shop owns every card verb.
- The rail's two unit/card registers take the Enchiridion's Units and Cards marks
  respectively, rather than the Prosopography and the Chartulary sharing one mark as adjacent
  tabs.

Two things had to become linkable before this section could be handed over at all, and both are
general rather than particular to it:

- **The crafter can say what a Run already holds.** `cards=<card>[,<card>]` (and the JSON
  `cards`) buys those cards for real in the opening Shop and carries them through every Battle
  before the target, so they arrive with a history — units lost, Pestiferous cards deteriorated —
  rather than as a fresh purchase. Gold is restored afterwards and the staged offers are
  withdrawn, so held cards change nothing else about the state. `cards` and `army` are mutually
  exclusive, because a crafted army replaces the roster the cards put there. Before this, every
  crafted state held exactly one card (the fast-forward's opening purchase) and no link could
  show a populated Chartulary.
- **A craft link can land inside a Run workspace.** `?to=<address>` names where the link lands
  after crafting; only an address inside the Run is honoured, and never another craft link. A
  crafted state is now handed over pointing at the workspace it is about instead of one click
  short of it.

## Consequences

- Every phase of a Run can answer "what did I buy, and what is left of it" from the same
  Controls mark that already opens the army and the lipsana.
- The card gallery has one implementation of its filter row and its grouping, so a change to
  either lands on both the reference and the register.
- Cards are permanent once bought: the Chartulary keeps a card whose every unit has been sold
  or lost. Nothing in the Run removes an owned card, and the gallery does not distinguish one
  whose units are gone — the card is the record, not the units.
- A held card carrying a core id no longer in the deck is dropped from the gallery rather than
  drawn as a blank face.
