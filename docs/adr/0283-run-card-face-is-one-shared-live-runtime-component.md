---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - 0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md
  - 0085-runtime-assets-are-live-storage-backed.md
  - 0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md
  - 0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md
partially_supersedes:
  - 0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md
---

# ADR-0283: Run card face is one shared live runtime component

## Context

The Card Layout instrument established and tuned the complete trading-card
face, but the first runtime wiring placed the newly accepted illustrations in
the older plain bundle-offer box. That made the Studio prototype and the game
two different card systems even though the owner had already approved the
prototype's frame, title, cost, type line, ledger, and flavor composition.

## Decision

The Card Layout face is the canonical Run-card renderer.

- `RunCardFace` owns the visible title/cost header, illustration pane, type
  strip, unit ledger, and bottom-anchored italic flavor region.
- The Studio Card Layout instrument, opening draft, shop, routable card review,
  and Enchiridion all render that component. Runtime hosts may contribute a
  button and state, but not a second card shell or alternate anatomy.
- The owner handoff is the default layout: reference width 360 px; title
  6.85cqw at horizontal 1.35cqw; type 5.3cqw at the same horizontal position;
  cost 6.2cqw; and flavor 5cqw. Studio remains the owner-operable tuning
  instrument for a future superseding adjustment.
- The selected 1060×1484 frame is accepted through the semantic slot
  `ui/run/card-prototypes/frame-v1.png`. Runtime resolves that slot and each
  card's accepted `ui/run/card-art/<canonical-card-id>/illustration.png` slot;
  neither has a packaged fallback.
- A core card supplies its stable name and flavor, live one-through-nine cost,
  `Units` type line, and composition-derived unit cells. Repeated pieces are
  counted and rendered with the canonical blue south-facing unit sprites.

## Consequences

- A card cannot look correct in Card Layout but silently regress to the old
  offer box in the shop or reference system.
- Frame and illustration replacement remain live-media pointer operations and
  do not require changing the component or baking values into raster art.
- Interaction states must fit around the physical card face instead of taking
  over its title, type, rules, or flavor regions.

## More Information

- [ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)
- [ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)
- [ADR-0282](0282-units-card-art-uses-a-pixellab-pixel-art-core-set.md)
- [Runtime asset contract](../runtime-asset-contract.md)
