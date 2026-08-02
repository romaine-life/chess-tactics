---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Claude
---

# ADR-0333: Live card faces derive their density step from card load

## Context and Problem Statement

ADR-0270 accepted that sparse Run cards use the room available while denser
cards step down in deliberate density steps. The Contents Box study delivered
under it produced four owner-reviewed steps — Roomy (1 cell), Filled (2 cells),
Packed (3 cells over 2 rows), and Scrunched (5 cells over 3 rows) — but they
shipped only as Studio comparison specimens behind `contentsStudy=1`. Every
live surface (shops, art review, Enchiridion) still rendered one fixed
Contents treatment near the dense end, so one- and two-cell cards showed small
unit rows above a large empty parchment gap.

## Decision Drivers

- ADR-0270's "sparse cards use the room available" was accepted but not live.
- The four step tunings were hand-reviewed at the real card size; inventing a
  parallel live scale would discard that review.
- Cards carry variable extras (Positioned properties, rules text, authored
  flavor lengths) and two frame geometries with different Contents Box
  heights; a bigger step must never clip the bottom-anchored flavor.
- The face crossfades between card presentations; a step change must not
  restyle the outgoing card with the incoming card's density.

## Decision Outcome

Chosen: **the shared face derives each card's density step from its own load;
the reviewed study tunings are the single accepted ladder.**

- The four study tunings move into the shared face as the accepted density
  ladder; the Studio study renders the identical ladder objects.
- A card's cell count picks its reviewed anchor step: one cell Roomy, two
  cells Filled, three or four cells (two ledger rows) Packed, five or more
  Scrunched.
- The anchor moves denser only when a conservative height estimate — ledger
  rows plus rules, properties, and flavor lines against the card's actual
  frame-geometry Contents Box — says the stack would not fit. Clipped flavor
  is never accepted; the densest step is the floor.
- After the step is fixed, the flavor text is dynamic too: it grows in small
  increments into whatever estimated box room remains, capped at 1.3× its
  base scale. Units always win the step first — flavor growth never
  influences step selection and never grows past the clip check.
- Density resolves per crossfade layer from that layer's own card, so an
  outgoing face keeps its own step while the incoming card loads.
- An explicit `contentsTuning` remains a Studio-only experiment override and
  bypasses derivation, stamped `data-contents-density="explicit"`.

### Consequences

- Good: one-cell shop cards finally use their Contents Box instead of showing
  a wasted parchment field; the fix lands on every host of the shared face.
- Good: the owner-reviewed step values stay the only density source of truth.
- Cost: the fit estimate mirrors Contents Box CSS constants (padding, line
  heights, a conservative glyph advance); changing that CSS means revisiting
  the estimator's constants.
- Cost: cards near a step boundary can change step when their extras change
  (for example a revealed Positioned target lengthening its property line);
  the estimate's conservative rounding keeps such flips rare.

## More Information

- [ADR-0270](0270-run-card-ledgers-adapt-density-and-preserve-flavor.md)
- [ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)
- [ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)
