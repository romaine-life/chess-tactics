---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - 0282-run-card-face-is-one-shared-live-runtime-component.md
---

# ADR-0283: Run card type lines use one optically centered baseline

## Context

ADR-0282 installed the Card Layout handoff with a `5.3cqw` type size and a
`0.2cqw` vertical offset. The accepted **Units — Pestiferous** qualifier exposed
a rough upper-weighted baseline in the narrow type strip. The type's existing
visual weight is correct; shrinking it or introducing a frame-specific or
qualifier-specific correction would make the hierarchy or the shared
`RunCardFace` diverge.

## Decision

All Run-card type lines retain one shared tuning in `RunCardFace`:

- type size remains `5.3cqw`;
- horizontal offset remains `1.35cqw`;
- vertical offset is `0.65cqw`;
- ordinary, Pestiferous, Tactical, and future primary-family labels use those
  same values without per-label scaling, rotation, or positioning branches.

Title, cost, art, ledger, flavor, and frame geometry remain unchanged. Card
Layout continues to expose the shared values as the owner-operable instrument.

## Consequences

- Good: longer affected qualifiers sit lower in the strip while ordinary labels
  keep the same visual baseline and every label retains its original weight.
- Good: every runtime consumer still receives the same `RunCardFace` rather
  than a Pestiferous-only typography exception.
- Cost: the larger original type scale keeps the strip intentionally dense.

## More Information

- [ADR-0276](0276-run-type-lines-declare-primary-families-and-affected-qualifiers.md)
- [ADR-0282](0282-run-card-face-is-one-shared-live-runtime-component.md)
- [Game concept](../game-concept.md)
