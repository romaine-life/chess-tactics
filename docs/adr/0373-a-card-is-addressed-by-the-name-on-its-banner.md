---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0256](0256-individual-lipsana-are-routable-from-the-main-menu-enchiridion.md)"
  - "[ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)"
partially_supersedes:
  - "[ADR-0262](0262-bundle-cards-are-scene-vignettes-with-authored-names-and-a-codex.md)'s composition-id card address"
  - "[ADR-0364](0364-enchiridion-cards-is-a-terminal-gallery-with-no-fourth-column.md)'s `<card-id>` address token and marked-in-the-gallery clause"
---

# ADR-0373: A card is addressed by the name on its banner

## Context

Cards became addressable records under ADR-0262, with the same routed/ephemeral split ADR-0256
gave lipsana, and ADR-0364 carried the address forward as `/enchiridion/cards/<card-id>`. That id
is the card's piece composition in initials — `ppb` is two Pawns and a Bishop — which is an
implementation detail of how the deck is generated. The card itself prints **Country Parish**
across its banner. Reading the address told you nothing about the card you were looking at, and
no address could be typed, guessed, or recognized after the fact.

ADR-0364 also said an addressed card is "marked in the gallery", and the marking that shipped was
a hand-rolled blue ring: `outline: 2px solid rgba(101, 184, 255, .82)` on
`.enchiridion-card-gallery-trigger.is-addressed`. Visual treatment on a player-facing surface in
this game is authored art, not CSS (ADR-0002, ADR-0052). A card face is already a fully drawn
object; ringing it in browser chrome reads as a web widget sitting inside the game.

## Decision

- **A card's address is the name printed on its face**, lowercased, apostrophes dropped, every
  other run of non-alphanumerics collapsed to a single hyphen:
  `/enchiridion/cards/country-parish`, `/enchiridion/cards/pilgrims-escort`. `runCardSlug` owns
  the transform and `RUN_CARD_ID_BY_SLUG` resolves it back, so the address language has one
  implementation rather than a writer and a lookalike parser.
- The piece-initial id stays the model's key — for `RUN_CARD_BY_ID`, art slots, craft specs, and
  persistence. Only the *address* changes. A composition with no authored name (an art-review
  fixture) addresses as its id rather than as an empty segment.
- Names are already unique and are tested to slugify uniquely, so the address is a total,
  reversible naming of the deck. A renamed card changes its address; addresses are not documents
  and nothing persists one.
- **The addressed card gets no highlight.** The `.is-addressed` outline is deleted with no
  replacement: the gallery still scrolls the addressed face into view, and the face still carries
  `aria-pressed`/`aria-current` for assistive technology, but nothing is painted over the art. If
  an addressed card should ever look different, that is authored art on the card, not a ring
  around it.
- Keyboard focus keeps the one shared `button:focus-visible` outline every control in the app
  already uses. That is accessibility affordance, not decoration, and it is not per-surface CSS.

## Consequences

- An Enchiridion card link is legible on sight and survives being pasted into a message: the
  address says which card it opens.
- The Cards gallery paints nothing of its own over the card art, so the faces read as objects on
  a shelf rather than as selected items in a list.
- Any surface that wants to show which card is addressed must earn it on the card, which is the
  same constraint ADR-0364 put on the gallery when it refused a fourth-column detail pane.
