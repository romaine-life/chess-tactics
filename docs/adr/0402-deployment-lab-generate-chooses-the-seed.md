---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0401](0401-deployment-lab-generates-an-editable-seeded-crew.md)'s owner-set generation seed"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
---

# ADR-0402: Deployment Lab Generate chooses the seed

## Context

ADR-0401 required the owner to set a seed and then press Generate. That copied the low-level
inputs of Town and Forest generation, but not the desired Deployment Lab task: asking for another
random crew. Choosing a particular generation seed before seeing the case adds an unnecessary
step and gives the seed more product prominence than it needs.

The generated case still needs an internal seed because the canonical placement pass is seeded and
the URL must reproduce an observed result. Reproducibility does not require making seed selection a
prerequisite for ordinary generation.

## Decision

- The Crew generator exposes one action: **Generate**. It has no manual seed-setting control.
- Every Generate click chooses a fresh random seed from the lab's 0–99,999 seed space and then
  deals the ADR-0401 crew from that seed. If the random draw repeats the current seed, it advances
  once with wraparound so a click always selects a different seed.
- The chosen seed becomes the case's normal deployment seed, so the generated crew and canonical
  placement result belong to the same random case.
- The seed remains URL-persisted and may remain visible as diagnostic result metadata. It is not an
  input the owner must understand or set before generating.
- ADR-0401's materialized-data contract is unchanged: Generate replaces the roster, and every
  generated type and ability remains manually editable afterward.

## Consequences

- Producing another random crew is one click rather than edit-then-click.
- Exact generated and manually refined cases remain linkable and reproducible.
- The deterministic crew algorithm stays independently testable even though the normal interface
  chooses its input seed automatically.

## More Information

- [ADR-0401](0401-deployment-lab-generates-an-editable-seeded-crew.md)
- [ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)
