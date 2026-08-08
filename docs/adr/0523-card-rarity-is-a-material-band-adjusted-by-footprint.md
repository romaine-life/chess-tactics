---
status: accepted
date: 2026-08-08
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)'s rarity-free complete-shuffle pile"
partially_supersedes:
  - "[ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)'s 180-card 75/20/5 quota and its per-rarity unseen queues"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s roster-and-bishop-parity rarity rule"
---

# ADR-0523: Card rarity is a material band adjusted by footprint

## Context

Value gain between Battles could not be authored against. A Battle pays half the enemy force's
material and a card costs its value, so army growth per Battle should already equal the reward the
Level sets — but it did not, for two reasons.

The first is the catalog's shape. Four-unit rosters are where the combinations explode, so of the
272 live offer identities **257 cost more than four**, 142 of them cost exactly eight, and only 15
cost four or less. ADR-0515 deals a flat shuffle of that catalog, which puts the average offer at
7.33 gold. An early row is therefore a row nobody can afford; its gold banks, and two Battles later
it lands at once. The lumpiness was banking, not the reward.

The second is that the previous rarity rule read roster composition — any Queen, any two Rooks,
three non-Pawns, or an opposite-colour Bishop pair was Rare — and so did not track value at all. A
Common could carry eight material (two same-colour Bishops and two Pawns), and the declared 75/20/5
was a per-card roll, correct only over a long sample and never over the fifteen-odd offers a single
Run sees.

A rarity rule keyed purely to value fixes the second problem and worsens the first: with Common
capped at four, the market becomes the same 15 identities four rows out of five.

## Decision

**Rarity is a material band, adjusted by footprint.** Common through value 4, Uncommon at 5 and 6,
Rare above. Five four-cell footprints then drop one tier: both Z chiralities, T, J, and L. Each is
a bar with its fourth seat pushed off the line, so it cannot be tucked against a neighbour the way
a square, a straight run, or a corner can, and its material overstates what it is worth on a board.
An opposite-colour Bishop pair keeps its band on any footprint — the pair is the prize and the
shape it arrives on does not spoil it.

That yields **47 Common, 123 Uncommon, 102 Rare**. Every Common above the value band is one of the
32 awkward value-6 cards, so the Common tier can be rich without handing out clean material.

**Rates are quotas, not rolls.** A pile is 20 cards holding exactly 16 Common, 3 Uncommon, and 1
Rare — the declared 80/15/5. Composition is identical every pile rather than converging over a long
sample, which is what makes a pile something a Level can be authored against. Each rarity draws
from its own independently seeded shuffle and the seats are shuffled together, so order stays a
surprise. Exhausting a pile builds the next one the same way.

**The market opens under a cost ceiling.** The Sectios following Battles 1 and 2 draw from a pile
capped at a card cost of six; the ceiling then lifts for good. No card at or below six is Rare, so
the ceiling empties that tier and its share is re-apportioned by largest remainder to the tiers
still standing — 17 Common and 3 Uncommon.

The ceiling is a granularity control, not a discount. Measured over 400 seeds it moves a row from
16.9 to 15.6 gold, because the demoted value-6 cards it admits are most of the Common tier. What it
removes is the unaffordable row: a capped row reliably carries cards a first or second Battle's
gold can actually take, where a flat shuffle of a catalog averaging 7.33 offered three cards at
once that it could not.

The cursor runs continuously but indexes the pile the Battle's own ceiling defines, so a card
passed over while the market was capped may be offered again once it is not. A row guarantees its
own composition, not membership across a change of ceiling. This is a market, not a draft.

Rarity stays derived rather than persisted: a stored offer re-reads it from the live catalog on
load.

**A banner name means one illustration and one frame.** Names were keyed to roster alone, which
gave 272 cards 36 names: a Sectio row repeated a banner 43.6% of the time, and 20 of those names
spanned more than one illustration — the same title over two different pictures, which reads as a
rendering fault rather than a naming scheme. Names are now keyed to the art id, the same
`(footprint, roster)` key ADR-0520 keys an illustration to, split further on the five awkward
footprints where a Bishop pair's seat colours put one illustration in two frames. That is 99 names.
A roster keeps its title on the shape that reads as its plain form and the other footprints qualify
it — Close for the square, Broken and Crooked for the two Z chiralities, Bent and Hooked for J and
L, Crossroads for the T — so the family stays legible while the card in hand is named exactly.

Cards may still share a name, but only when they share both footprint and roster and so differ
solely in which piece sits in which seat — the distinction the card's own formation diagram draws,
and the same argument ADR-0520 makes for sharing an illustration. **A dealt row never shows one
banner twice**: a pile seats each banner once, and a row that straddles two piles reads past a
repeat, spending the skipped position rather than printing the same card twice over.

RunSaveVersion advances to 32. Browser migration and append-only database migration 71 restart the
hidden cursor at zero because the pile sequence changed outright. A Sectio already open keeps the
row it is showing — those offers are a transaction the player is part-way through — and relabels
its own rarity on load. Everything already bought, sold, or expuncted stands.

## Consequences

- Army value per Battle settles onto the gold the Level already authored, because gold converts
  into cards instead of banking behind an unaffordable row. Total gain remains the enemy roster's
  business; the card pool only decides granularity.
- Roughly one capped row in five still comes out entirely at six gold, since value-6 cards are 32
  of the 47 Commons. Banking is reduced rather than eliminated. Lowering the opening ceiling to
  five, or holding the demoted value-6 cards out of the capped pile, are the levers if that proves
  too coarse in play.
- The Common tier is 47 identities rather than 15, so the opening market does not repeat itself,
  and it averages 5.17 rather than 3.40 without ever offering cleanly-packed material.
- Rare is 102 identities behind a 5% quota, so a single Run meets roughly one. The catalog and its
  94 illustrations are long-tail content across many Runs by design, not within one.
- Awkward geometry becomes the price of cheap material. A player who wants a value-8 card early can
  have one, and it will be a shape they have to solve.
- The market stops looking like it is repeating itself. Naming by illustration means a shape the
  player recognizes has a title of its own, and the row-level guarantee removes the case that read
  as a bug: the same banner, twice, at two different rarities.
- Flavor text is still keyed to roster, so sibling footprints share a line. That is far less visible
  than a repeated banner and is left for a later authoring pass.
- In-progress Runs restart their hidden card sequence. The owner's active Run is disposable test
  state; other accounts keep every completed transaction.

## More Information

- [ADR-0515](0515-player-arranges-rotation-canonical-cards-from-a-complete-shuffle.md)
- [ADR-0494](0494-runs-begin-in-battle-and-sectio-deals-a-derived-rarity-pile.md)
- [ADR-0516](0516-the-run-opens-with-a-formation-card-grant-on-a-band-deep-enough-to-turn.md)
- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
