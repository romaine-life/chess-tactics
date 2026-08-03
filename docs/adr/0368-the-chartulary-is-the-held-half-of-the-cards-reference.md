---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0335](0335-the-strategikon-is-a-run-wide-reference-not-a-battle-only-workspace.md)"
  - "[ADR-0364](0364-enchiridion-cards-is-a-terminal-gallery-with-no-fourth-column.md)"
---

# ADR-0368: The Chartulary is the held half of the Cards reference

## Context

The Strategikon carries two registers that read the live Run — the Martial Prosopography
(the current army) and the Lipsanotheca (held relics) — beside the Enchiridion, which reads
the game's fixed content. Cards had only the fixed half. `RunDocument.cards` has recorded
every purchase since the Run format gained it, and nothing in the game displayed it: a player
could see every card the deck *can* deal and no surface at all for the cards they *bought*.

The gap is not merely a missing list. A held card is the receipt for gold already spent, and
it is the only place the Run records which army units came from which purchase. The
Prosopography shows the units; it cannot say which card put them there, or that a card's
units are all gone.

## Decision

- The Strategikon gains a third Run register, **the Chartulary — Held Cards**, at
  `/play|/run/strategikon/chartulary`. It is an authored section scene like its two
  siblings, so section travel is a director transition, not a swap.
- It is the Enchiridion Cards gallery, not a lookalike: the same section frame, the same
  filter row, the same gold-value coin groups, the same `RunCard` faces at the same size.
  One `CardGalleryFilters` component now serves both galleries so the two cannot drift.
  Grouping stays by gold value; `acquiredAfterBattleIndex` is deliberately NOT printed as a
  Battle number, because the opening Shop and the Shop after Battle 1 both record `0`.
- What a held card adds is its **register**: the units it actually put in the army, named and
  wearing the Prosopography's own trait glyphs, plus a count of the ones that have left. That
  count is taken against the card's own pieces, never `lostUnitIds` — that field records
  Pestiferous attrition only, so a sold unit is invisible to it.
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
  Controls mark that already opens the army and the relics.
- The card gallery has one implementation of its filter row and its grouping, so a change to
  either lands on both the reference and the register.
- Cards are permanent once bought: the Chartulary keeps a card whose every unit has been sold
  or lost, and says so. Nothing in the Run removes an owned card.
- A held card carrying a core id no longer in the deck is dropped from the gallery rather than
  drawn as a blank face.
