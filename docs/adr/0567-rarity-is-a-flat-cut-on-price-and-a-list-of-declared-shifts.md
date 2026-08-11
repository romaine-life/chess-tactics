---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0523](0523-card-rarity-is-a-material-band-adjusted-by-footprint.md)'s material band and its awkward-footprint demotion"
  - "[ADR-0532](0532-a-bishop-costs-a-rarity-band-because-the-pair-is-assembled-by-hand.md)'s Bishop step"
---

# ADR-0567: Rarity is a flat cut on price and a list of declared shifts

## Context

A Sectio dealt **Three at the Turning twice in the same row of three**.

The market a new Run shops in caps a formation at two cells on its longest side
([ADR-0512](0512-run-creation-selects-automatic-or-arranged-formations.md)'s rules), which leaves 69
cards. Rarity banded on raw material — Common through 4 — and only **six** of those 69 cleared it.
A pile is 20 cards holding exactly 16 Common, and `sectioCardPile` fills a tier short of its quota by
repeating identities rather than by shrinking the pile, so every pile dealt each of those six cards
about two and a half times. Measured over 400 seeds, **22.6% of rows carried a duplicate**, and rows
of three identical cards occurred.

The rule had not changed. The market under it had.

ADR-0523 stocked Common by stepping the five awkward four-cell footprints DOWN a tier: material
overstates a shape that packs badly, so the demotion put value-6 cards into Common without handing
out clean material. Sixteen of the 29 Commons were there by that step alone. **Every one of those
five footprints is three cells long**, so a two-by-two shape rule deletes all of them — and the step
went silently inert. Nothing reported it. It was found by reading the code after the duplicate turned
up on screen.

Two further things were wrong underneath that.

Material stopped tracking what a card is worth the moment pricing began weighting it by
concentration. A Queen alone is 9 material and 160 gold; a Queen with a Pawn is 10 material and 130.
The material band called the cheaper card the dearer one. Rarity and price were reading different
books.

And the tiers had inverted against their own seats: 6 identities for 16 Common seats, 54 for a single
Rare seat. A card in the largest tier appeared 2.67 times per pile; a given Rare appeared in about 2%
of Runs. The catalog owed 63 illustrations, all of them for cards a player would almost never meet.

## Decision

**Rarity is a flat cut on price, then an ordered list of declared shifts.**

The cut is on the gold the card face prints: Common through 70, Uncommon through 100, Rare above.
Price is computed on the canonical density curve rather than the asking Run's own, so a card's tier
is a property of the catalog — the frame a card wears must not change because a Run is playing the
legacy rules.

A **shift** is one declared move of a named set of cards between tiers, and it is DATA rather than a
clause inside the function. It carries an id, a name, the reason it exists, and a predicate. Naming a
`from` tier makes it a MOVE — these cards come out of that tier, and if they are not in it the shift
declines. Omitting `from` makes it an INTRODUCTION — put these in this tier from wherever they sit.

`runRarityShiftAudit` reports, per shift, how many cards it actually moved against the market a given
`RunRules` leaves. **A shift that moves nothing is dead**, and the Card Pool studio prints it in red
saying so. This is the whole reason shifts are data: the demotion that went inert would have been
reporting `MOVES NOTHING` from the day the shape rule narrowed, instead of surfacing as a duplicate
card in a Sectio row weeks later.

One shift ships:

**A card of nothing but minors, two or more, is Rare.** Price reads a card as material over squares,
and two or three minors in a tight cluster price as ordinary. What they are worth is not their
material: the player places every formation by hand ([ADR-0526](0526-a-formation-is-carried-on-the-cursor.md)),
so a card of two Bishops IS the opposite-colour pair, and a card of three minors is a whole minor
battery arriving already assembled. No cut on price can see that — the Bishop pair, the Knight pair
and a lone Rook are all 60 gold.

ADR-0523's footprint demotion and ADR-0532's Bishop step are both **retired**, and their arguments
are answered rather than discarded. The demotion existed because material overstated a shape that
packs badly; a price weighted by density already charges that shape less, so there is nothing left to
correct. The Bishop step existed because material understated the assembled pair; the cluster shift
carries that, and reaches the Knight pair on the same argument instead of singling out one piece.

The market under the shipped rules becomes **41 Common / 14 Uncommon / 14 Rare**, from 6 / 9 / 54.

Rarity stays derived rather than persisted — a stored offer re-reads it from the live catalog on
load, exactly as ADR-0532 left it, so **no RunSaveVersion bump**.

## Consequences

- **The duplicate is gone.** 41 Common identities exceed the 16 Common seats, so a pile draws its
  seats from one shuffle and fills them with distinct cards. Duplicate rows fall from 22.6% to
  **0.31%**, and the remainder is a row straddling a pile boundary, which is inherent to the
  continuous cursor and not a tier problem.
- **The opening ceiling now empties Uncommon rather than Rare.** The ceiling is on material and the
  bands are on price: nothing at six material or less reaches 80 gold, while the minor pairs sit at
  60 and are Rare by shift. The capped pile re-apportions to 19 Common and 1 Rare, so the opening
  market is cheap cards and the occasional pair. This is a better opening than the old one, not a
  compromise: the pair is exactly the card worth saving for.
- **Common hands out more material per offer than it did**, because a card is now Common for being
  cheap and under density pricing the cheap cards spread their material over four squares. Growth per
  Battle is still authored in gold, which is what ADR-0523's ceiling holds down.
- **The Common tier on the legacy four-by-two catalog is enormous** — 229 of 269 — for the same
  reason. Nothing is dealt from it today, and it is the next thing worth arguing about rather than a
  reason to keep the bands on material.
- A lone Rook is Common. Five material on one square is 60 gold, and 60 gold is not an expensive
  card; the material band called it Uncommon on a number nobody pays.
- The illustration bill moves off the cards nobody sees: Uncommon plus Rare is 28 identities, down
  from 63.
- The Card Pool studio's `Shipped rule` models follow automatically, because they read
  `runCardRarity` rather than restating it, and its Rarity panel lists every shift with the cards it
  moved.

## More Information

- [ADR-0523](0523-card-rarity-is-a-material-band-adjusted-by-footprint.md)
- [ADR-0532](0532-a-bishop-costs-a-rarity-band-because-the-pair-is-assembled-by-hand.md)
- [ADR-0547](0547-gold-is-whole-and-the-stored-tenth-is-the-gold.md)
- [ADR-0551](0551-a-sectio-admits-one-card.md)
