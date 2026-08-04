---
status: superseded
date: 2026-08-03
deciders: owner (Nelson) + Codex
superseded_by:
  - "[ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)"
refines:
  - "[ADR-0058](0058-studio-uses-catalog-and-viewer-destinations.md)"
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)"
  - "[ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)"
---

# ADR-0398: Run Deployment has an owner-operated Studio lab

## Context

Deployment combines authored eligibility geometry, obstacles, seeded unit order, overflow,
Adlected manual placement, Eutactic row fallback, and Agminate station scoring. Tests can prove
individual examples, but they do not let the owner change those inputs and inspect the actual
placement pass. Reconstructing an explanation in a separate UI algorithm would create the same
prose-versus-code drift that confused authored piece regions with unit abilities.

## Decision

- Studio gains a click-reachable **Deployment Lab** Catalog category and typed Viewer kind. It uses
  the standing Studio main pane and Controls rail; it is not a bespoke route or a playable shadow
  content system.
- The Controls rail owns board files, one-to-eight ordinal deployment rows, optional gaps, seed,
  either layout roll, Pawn and King dedicated-region modes, a per-unit roster with any combination
  of Adlected/Eutactic/Agminate, an obstacle tool, and Adlected square tools.
- The lab creates a synthetic unsaved Level solely as instrument input, then calls the canonical
  `deploymentOptions`, `disciplinePlacementCells`, and `levelWithRunDeployment` paths. Its result
  is rendered by the canonical read-only board renderer. It never republishes this geometry as a
  War or alternative gameplay source.
- The canonical placer returns a transient per-unit trace with automatic order, eligible and
  available counts, Eutactic target/best/selected rows, final candidate count, Agminate score,
  chosen square, and outcome. The lab reads that trace; it does not recalculate an explanation.
  The trace is computed output and does not change `RunDocument` persistence.
- Every lab input is URL-addressable so a placement case can be handed off and reproduced exactly.

## Consequences

- Authored piece regions and automatic-placement abilities can be isolated or combined visibly.
- Three-or-more-row and irregular-row behavior is owner-testable without creating a War level.
- A future placement-rule change must update the canonical trace alongside the canonical result;
  the Studio surface cannot remain plausibly correct while explaining a different algorithm.

## More Information

- [Studio control architecture](../studio-control-architecture.md)
- [ADR-0367](0367-a-piece-type-can-be-broken-off-the-deployment-pool.md)
- [ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)
