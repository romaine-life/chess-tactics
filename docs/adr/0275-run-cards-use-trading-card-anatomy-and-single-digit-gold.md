---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0225](0225-run-bundle-cards-show-every-board-unit.md)'s inherited price placement and temporary card-shell assumptions"
extends:
  - "[ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)"
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)"
partially_superseded_by:
  - "[ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)'s selected frame direction and nonempty type-line grammar"
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)'s removal of automatic lower-box ability explanation"
---

# ADR-0275: Run cards use trading-card anatomy and single-digit gold

## Context and Problem Statement

The initial Run bundle UI evolved before the cards had a settled physical
grammar. Exploratory frames gave gold an oversized compartment, omitted the
card-type line, or treated the entire card as an undifferentiated unit display.
The owner wants the first pass to borrow the immediately legible anatomy of a
Magic: The Gathering card while retaining the project's own art and mechanics.

The remaining currency question is smaller than those explorations assumed.
Run card costs never require decimals, fractions, zero, or two digits: every
offered card costs a whole number from 1 through 9.

## Decision Drivers

- The title and cost must scan immediately in a shop row.
- Gold must remain visible without stealing space from the card name or art.
- Card types need a dedicated place because they author real card behavior.
- The rules box must carry a variable-density unit ledger and still preserve
  flavor text at its bottom.
- Generated raster art should not bake mutable game values into separate assets.

## Decision Outcome

Chosen: **one shared trading-card frame with a compact live single-digit cost.**

- The title occupies the upper-left of the header.
- The purchase cost occupies the upper-right of that same header. It is one
  compact blank gold-coin asset with one live numeral overlaid.
- The numeral is always exactly one integer from **1 through 9**. The card does
  not reserve space for a second digit and does not display a decimal, fraction,
  half coin, coin stack, or coin array.
- PixelLab or another asset generator may produce the single blank coin. The
  runtime owns the numeral, so there is no family of rasterized numbered coins.
- A large art pane follows the header and uses the game's existing unit art;
  the card frame itself supplies no replacement unit illustration.
- A narrow type line follows the art pane and displays applicable card types
  such as Tactical or Pestiferous.
- The lower rules box owns abilities and the unit ledger. The core card's flavor
  text stays at the bottom of that box and is not displaced by the type line.
- The first pass uses one common frame. Border variation by composition or power
  is deferred until the common anatomy has been tested at real shop size.
- Current generated frame images are exploratory candidates, not accepted
  runtime art.

### Consequences

- Good: every possible cost has identical geometry and remains readable at a
  glance.
- Good: card identity, card type, exact contents, and flavor each have a stable
  semantic region.
- Good: balancing a cost does not require regenerating art.
- Cost: the offer-generation rules must preserve the 1-through-9 cost invariant
  as modifiers are applied; the exact eligibility policy is a separate balance
  decision.
- Deferred: final dimensions, exact pane proportions, ledger grouping, and the
  accepted frame pixels remain owner-operable visual experiments.

## More Information

- [Game concept](../game-concept.md)
- [ADR-0219](0219-run-piece-bundles-are-portrait-cards-with-a-live-gold-icon.md)
- [ADR-0225](0225-run-bundle-cards-show-every-board-unit.md)
- [ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)
- [ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)
