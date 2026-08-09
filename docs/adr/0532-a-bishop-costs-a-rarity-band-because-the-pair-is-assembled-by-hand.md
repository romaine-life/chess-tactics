---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0523](0523-card-rarity-is-a-material-band-adjusted-by-footprint.md)'s opposite-colour Bishop pair exemption and its claim that the opening cost ceiling empties the Rare tier"
---

# ADR-0532: A Bishop costs a rarity band, because the pair is assembled by hand

## Context

[ADR-0523](0523-card-rarity-is-a-material-band-adjusted-by-footprint.md) prices rarity from
material and adjusts it by footprint, and treats an **opposite-colour Bishop pair printed on one
card** as the prize — exempting it from the awkward-shape demotion. That test was written when a
card's own geometry decided what the player got.

[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) placement is by hand. The player carries
each formation on the cursor and chooses the squares it lands on, so the colour a Bishop stands on
is a placement decision, not a card property. **Any two Bishops the player owns become the
opposite-colour pair**, whichever cards they arrived on. The pair is assembled in the deployment
band; it is never printed.

Under that reading the market was handing the prize out freely. A Bishop is one of five piece types
on a material scale where it ties the Knight at three, so **153 of the 269 offer identities carry
one**, 18 of them Common. Weighted by pile seats that is **8.5 Bishop cards in every 20-card pile**
— a Run is offered roughly nine, and reaching two is a certainty rather than an outcome. The
cheapest were `b` at three gold and `pb-front` at four, both Common, both in the tier that owns
80% of every pile.

Card-local parity survived as the only Bishop signal rarity read, and it answers a question nobody
is asking: it decides what one card's own two Bishops cover, never whether the player ends the Run
holding the pair.

## Decision

**A Bishop costs a rarity band.** Material sets the band and footprint adjusts it exactly as
ADR-0523 wrote; a card carrying any Bishop then moves up one tier, clamped at Rare.

Three consequences follow from the single rule rather than being written separately:

- **No Bishop card is Common.** The tier that owns 16 of a pile's 20 seats stops dealing Bishops
  at all, which is where nearly all of the frequency was.
- **Every card carrying two Bishops is Rare.** A made pair on one card is the strongest Bishop
  source in the market, and is priced as the prize.
- **The two adjustments cancel on an awkward shape carrying a Bishop**, which restores what the
  old exemption protected without naming it — and extends it to same-colour pairs and lone
  Bishops, which is the point. A Bishop is worth exactly the band a wasteful shape costs.

**Card-local parity is not read at all.** The `(x + y) % 2` test is deleted rather than widened.

**The opening cost ceiling stops emptying a tier.** Ten Bishop cards are Rare at six gold or less,
so the capped market keeps the full 16/3/1 quota instead of re-apportioning to 17/3/0. The ceiling
was always about affordability, never about rarity, and a six-gold Rare is affordable. The
largest-remainder re-apportionment stays — it is still reached by any ceiling that does empty a
tier — it is simply no longer reached by the live one.

**No RunSaveVersion bump.** Rarity is derived, not persisted: a stored offer re-reads it from the
live catalog on load (ADR-0523). No stored field changes shape or meaning, so a Run in flight keeps
its hidden cursor and meets the new piles from wherever it stands.

## Consequences

- Bishop cards fall from **8.5 to 1.6 per 20-card pile**. Across a Run's ~21 offers that is ~9
  down to ~1.6, and the chance of being offered two at all falls from a certainty to about **half
  of Runs** — before the player has to afford both. The pair becomes something a Run may or may
  not get.
- The scarcity ladder now reads pawn 19.2, knight 12.0, bishop 1.6, rook 0.9, queen 0.01 cards per
  pile. The Bishop sits between the Knight it ties on material and the Rook, which is the intent:
  the same three material is worth more when a second one can always be found a complementary
  square.
- **The Common tier falls from 47 identities to 29**, since 18 Commons carried a Bishop. ADR-0523
  widened Common from 15 precisely so the opening market would not repeat itself, and this gives
  part of that back — 16 Common seats now draw from 29 faces rather than 47. If the early market
  reads repetitive in play, the lever is the same one ADR-0523 named: which value-6 footprints
  demote into Common.
- Rare becomes 169 identities of 269 behind a 5% quota. The tier's meaning comes from its one seat
  in twenty, not from its population, and the long tail gets longer.
- An early Sectio can now deal a Rare, and it will usually be a Bishop card. That is a legible
  signal rather than a leak: the forged-steel frame in the opening market means the prize is on
  the row.
- Knights absorb the space Bishops leave — 8.7 to 12.0 cards per pile — so the cheap tier stays as
  full as it was.

## More Information

- [ADR-0523](0523-card-rarity-is-a-material-band-adjusted-by-footprint.md)
- [ADR-0526](0526-a-formation-is-carried-on-the-cursor.md)
- [ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)
- [Persistence](../persistence.md)
