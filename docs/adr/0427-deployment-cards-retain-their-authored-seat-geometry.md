---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s allowance for the visible face to condense surviving contents"
refines:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)"
---

# ADR-0427: Deployment cards retain their authored seat geometry

## Context

The first Deployment card projection removed every already-played unit from the transient card
definition. The canonical face then correctly treated that smaller definition as a different card:
it recomputed its ledger cells, selected a new density step, enlarged sparse survivors, and centred
same-type stacks around their new count. The persisted unit-seat order remained correct, but the
visible card looked as though it had been recomposed rather than as though something had left it.

A played unit should leave evidence on the object that supplied it. The face already has durable
authored piece positions and the owned card already has nullable seats; Deployment does not need a
second compact composition to express the remaining contents.

## Decision

- An active Deployment card always projects its complete authored piece composition. Played, sold,
  or lost occurrences become **empty seats** on that same face rather than being removed from the
  composition.
- Authored occurrence count controls ledger cells, density selection, unit scale, stack width, and
  each survivor's stack index for the entire reveal-to-discard lifetime. A remaining unit therefore
  stays at the same size and in the same seat after an earlier unit leaves.
- The visible count reports occupied occurrences. An empty occurrence draws no unit sprite and no
  attached unit-state marker, leaving the original seat visibly vacant; accessible card contents
  name the remaining units and the number of empty seats.
- Empty-seat state is an option on the one canonical Run-card face projection. Ordinary cards omit
  it and render unchanged. Deployment derives it from the owned card's nullable seats and persisted
  unit cursor; it does not author a parallel face or mutate the card definition.
- Atomic face identity includes the empty-seat mask. Media readiness requires only sprites and
  state icons that remain visible, so an intentionally absent unit cannot prevent the updated face
  from presenting.
- Card order, placement, settlement, discard, and persistence do not change. Existing card seats and
  Deployment cursor already own the complete state, so no Run-save or database migration is needed.

## Consequences

- A two-unit card becomes a two-seat card with one vacancy after its first unit deploys instead of
  turning into the reviewed one-unit layout.
- The visual change now communicates subtraction from a persistent game object without leaking or
  inventing information.
- Card-face density remains a property of the authored card load, not of transient Deployment
  progress.

## More Information

- [ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)
- [ADR-0422](0422-deployment-deals-a-visible-deck-before-transport-begins.md)
- [Shared UI primitive registry](../shared-ui-primitives.md)
