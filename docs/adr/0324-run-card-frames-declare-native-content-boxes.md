---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
extends:
  - "[ADR-0275](0275-run-cards-use-trading-card-anatomy-and-single-digit-gold.md)"
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0285](0285-run-card-type-lines-use-one-optically-centered-baseline.md)"
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)"
  - "[ADR-0314](0314-run-card-presentations-promote-atomically.md)"
---

# ADR-0324: Run card frames declare native content boxes

## Context

Generated Run-card frames can preserve the approved trading-card anatomy while
placing their title, coin, illustration, type, and Contents Box panels at
slightly different coordinates. Requiring generated pixels to reproduce one
frame's exact geometry discarded the stronger forged-steel Concinnous result.
Conversely, adding per-card CSS nudges would fork the shared face and make its
content sizing dependent on whichever generated frame happened to be visible.

The renderer therefore needs a stable boundary between generated pixels and the
formula that lays out live card content.

## Decision

Each distinct Run-card frame geometry declares five measured rectangles in the
native **1060×1484** source coordinate system:

- `title`
- `cost`
- `art`
- `type`
- `contents`

The rectangle set is a Git-owned geometry profile bound to the exact SHA-256 of
the frame pixels it measures. `RunCardFace` remains the one shared runtime and
review component. It converts each rectangle with the same formula:

- horizontal position and width are divided by 1060;
- vertical position and height are divided by 1484;
- the resulting percentages define the responsive containing box;
- shared title, cost, type-line, ledger, property, and flavor tuning is applied
  inside that box.

This is one formula over explicit frame inputs, not a per-card layout branch.
Card names and type labels do not receive individual placement overrides.
Unknown or unmatched frame hashes use the Standard profile; a candidate cannot
silently change runtime geometry before its exact pixels are promoted.
The geometry profile is part of ADR-0314's atomic presentation identity, so a
new frame and its measured boxes promote together after the pending card layer
is ready rather than producing a mixed old-frame/new-geometry state.

Card Layout exposes a routable measured-box overlay and includes the complete
profile in its copyable handoff. The accepted forged-steel Concinnous frame with
SHA-256
`0069be656caaebd00c0dd47e7e7a21d5c4f8978d170ecea1cbd11647767e75f3`
owns the initial non-Standard profile. Its profile also measures the distinct
steel coin center rather than inheriting the Standard frame's cost rectangle.

## Consequences

- Good: generated frames may keep their strongest visual geometry without
  forcing text and art outside their actual panels.
- Good: layout remains deterministic, responsive, inspectable, and shared by
  Card Layout, shop, review, and Enchiridion.
- Good: binding measurements to content hashes prevents a profile from drifting
  onto different accepted pixels.
- Cost: every meaningfully different frame generation needs one measured profile
  before promotion.
- Cost: replacing a frame with different geometry requires code review for its
  new profile as well as visual review of its pixels.

## More Information

- [Game concept](../game-concept.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [Asset generation contract](../asset-generation-contract.md)
- [ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)
- [ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)
