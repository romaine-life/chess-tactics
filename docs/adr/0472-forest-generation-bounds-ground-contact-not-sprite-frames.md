---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by: "[ADR-0473](0473-source-art-ground-contact-is-measured-from-base-alpha.md)'s frame-derived footprint sizing replacement"
refines:
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
  - "[ADR-0470](0470-placement-generator-sections-compose-mixed-and-distinct-approaches.md)"
---

# ADR-0472: Forest generation bounds ground contact, not sprite frames

## Context

Forest candidates were kept inside the selected grid by testing only their projected ground anchor.
That point test allowed the visible trunk, roots, rocks, or other ground-contact mass to cross the
selection edge. Testing the complete sprite rectangle instead would create the opposite defect:
branches, canopy, and other elevated art would be rejected even though they stand on valid ground.

Installed Forest source art has a distinct contact anchor and a much taller image frame. Inspection
of the installed turntables found that their visible contact bands can approach three quarters of
the rendered frame width, while their elevated pixels extend much farther outside that band.

## Decision

- Every generated Forest placement owns a projected elliptical **ground-contact footprint** centred
  on its seated contact anchor. Its diameter is 80% of the direction-specific rendered frame width
  after source and instance scale; projected depth is half that width.
- The complete ground-contact footprint must fit inside the exact outer edges of the selected grid
  cells. For a Distinct Section group, the same rule applies to its generated internal territory,
  so roots and bases do not leak into another group's ground.
- The sprite rectangle and elevated alpha are not placement bounds. Trunks above contact, branches,
  canopy, and other upper art may extend outside the selected cells.
- Forest and Town boundary tests use one canonical inverse-projection primitive for exact ellipse
  extents in grid space. Forest keeps its own contact-footprint sizing because a tree base is not a
  building footprint.
- This is deterministic generated geometry, not a new persisted recipe field or asset mode. Existing
  Forests adopt the corrected boundary on their next Generate or Regenerate.

## Consequences

- Large-rooted art may produce fewer placements near a boundary or require a larger selected patch.
- A forest may retain a natural overhanging canopy without visually standing on unselected ground.
- Regression coverage separately proves complete base containment and permitted sprite overhang.
