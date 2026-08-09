---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0220](0220-run-victory-gold-scales-with-enemy-force-value.md)"
  - "[ADR-0517](0517-a-player-en-passant-pays-a-five-gold-bounty.md)"
  - "[ADR-0527](0527-a-royal-fork-pays-one-gold.md)"
  - "[ADR-0539](0539-par-is-turns-and-the-speed-bonus-is-the-clock.md)"
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
  - "[ADR-0543](0543-a-mate-is-paid-for-the-army-it-did-not-have-to-take.md)"
---

# ADR-0547: Gold is whole, and the stored tenth is the gold

## Context

The Run carried gold as a fixed-point integer named `goldTenths` and divided it by ten on the way
to the screen. `formatGold` printed one or two decimal places whenever that division did not come
out whole, which was constantly: a Pawn on the winning board pays half its value, Manubiae and
Deditio both pay two tenths a point, and the speed bonus is rounded to a tenth. So the purse read
**12.5**, an advantageous capture read **+1.6**, and the smallest thing the economy could pay was
**0.1**.

Nothing was wrong with the ratios. The complaint was the decimal point.

Raising only the rewards is not available: a card costs its material value, so paying ten times
more against unchanged prices would buy the whole market off one Battle. The only change that
removes the decimals and leaves the game identical is to rescale *everything* by the same ten —
and the game was already storing exactly that number.

## Decision

**One tenth becomes one gold.** The stored integer is the gold amount, displayed unchanged.

- `formatGold` prints `String(Math.round(gold))`. There is no division and no decimal point,
  because there is no longer a sub-unit to have a fraction of.
- `GOLD_SCALE` (10) stops being a display divisor and becomes what it always mathematically was:
  **the gold one point of material value is worth**. A 3-point card costs 30 gold; the opening
  purse is 80; a Pawn taken on the winning board pays 5; en passant pays 50; the royal fork 10;
  paid Undo 10; a Battle retry 30; Deditio and advantageous capture 2 a point; the speed bonus
  caps at 10.
- `cardCostGold(value)` is the one conversion from material points to gold, used everywhere a
  point-valued number is shown as a price: the card-face coin, the Enchiridion's price bands and
  gold filter, and the Level Editor's War-economy readouts.

**No stored number changed, so no Run was migrated and `RunSaveVersion` does not move.** Every
persisted field holds precisely the integer it held before; only what the player reads off it is
different. Balance is untouched by construction — every price and every award moved by the same
factor, so the game plays exactly as it did.

Two boundaries move with the unit, because both speak the number on the screen:

- `craft`'s `gold=` takes whole gold and no longer multiplies. `?gold=250` crafts the purse the
  Run screen will show as 250, and a fractional amount is refused rather than rounded.
- The Enchiridion's card-gallery gold filter is written in gold: `?gold=30`, not `?gold=3`. A
  pre-existing single-digit band names no band and reads as no filter, which is what that
  address already does with anything it does not recognise.

## Consequences

Every card cost is now two digits. The card face already had the path for it — `runCardCostSizeCqw`
shrinks the numeral to the coin by digit count and `.is-multi-digit` tightens it — so this is the
supported rendering rather than a new one, but it is a visible change on every card in the game.

The `Tenths` suffix now lies. `goldTenths`, `victoryGoldTenths`, `RUN_BATTLE_RETRY_COST_TENTHS`
and the rest all hold whole gold. They keep their names deliberately: several are fields of the
persisted Run document and of the server's validator, so renaming them is a document-shape change
requiring a schema migration — and a migration cannot be applied locally (it ships through the PR
and runs on rollout), which would have made this change unverifiable in the browser while it was
being made. The authority on the unit is the block comment at `GOLD_SCALE`, which states outright
that everything suffixed `Tenths` is gold. Rename the family when a migration is being shipped for
its own reasons.

Material points are still their own unit and are not gold. `RunCardOffer.cost`, `RunCardDefinition.value`,
`RUN_SECTIO_EARLY_CARD_MAX_VALUE`, `RUN_STARTING_GOLD` and the whole `expectedValue` walk are
points — the server validator requires `offer.cost === definition.value`, and the War economy
compares gold against card values, so both are best left in the unit that comparison is in.
`cardCostGold` converts at the edge.
