---
status: "superseded by ADR-0086"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0083: Mirror aperture coverage is authored per asset

> **Superseded by
> [ADR-0086](0086-all-perimeter-walls-use-full-height-geometry.md)
> (2026-07-12).** ADR-0086 retains exact one-to-one reflection and the authored
> small/full-body aperture roles, but makes full-height generated geometry canonical for
> every perimeter wall and retires the mirror-only tall wall variant.

## Context and Problem Statement

ADR-0082 correctly established exact one-to-one reflection position, raster size, and
floor contact, but it then required every mirror aperture to contain the tallest accepted
unit's entire silhouette. The asset audit exposed that this conflated reflection physics
with frame design. The Grand Gallery is a full-body mirror and needs a tall wall/aperture;
the smaller Keep, Court, Chapel, and Witch's Eye mirrors are intentionally small authored
objects and may show only the portion of an exact-size reflection that lies behind their
glass.

The game-world reflection rule must remain identical for every mirror. What varies is the
authored aperture's coverage, not the reflected subject's transform.

## Decision Drivers

- Every mirror must retain ADR-0082's complete wall-plane position, 1:1 raster size, and
  exact floor-contact anchor.
- A small frame must be allowed to crop a full-size reflection naturally at its aperture.
- A full-body mirror must provide enough generated wall/frame/glass height for its stated
  purpose and must prove that coverage at board scale.
- Aperture size or shape must never become an implicit scale, offset, depth-compression,
  or focal-fit input.
- Tall mirror-bearing wall variants must remain valid board relief without changing
  logical wall geometry.
- Authored mirror intent must be visible in asset provenance and review evidence rather
  than inferred from whichever piece happens to fit.

## Considered Options

- Require every mirror aperture to contain the tallest accepted unit (ADR-0082).
- Make every aperture authoring choice free, including whether a claimed full-body mirror
  clips units.
- Keep exact reflection physics for every mirror, allow intentionally small apertures to
  crop, and require Grand Gallery/full-body mirrors to contain complete silhouettes
  (chosen).
- Fit each subject to its aperture with per-asset scale, position, or depth controls.

## Decision Outcome

Chosen: **aperture coverage is an authored asset role downstream of one invariant exact
reflection. Small mirrors may crop the unchanged 1:1 raster at their glass boundary;
Grand Gallery and any future full-body mirror must use a tall mirror-bearing wall, frame,
and aperture that contain the complete unit silhouette.** Cropping is a mask result, not
an alternate reflection transform.

The implementation follows these rules:

1. **Exact reflection remains universal.** Every mirror uses ADR-0082's full continuous
   board-grid wall-plane transform:

   ```text
   west wall at x = -0.5:  r = (-1 - px, py)
   north wall at y = -0.5: r = (px, -1 - py)
   ```

   The reflected draw retains the physical board draw's resolved width, height, and
   exact reflected floor-contact anchor. No mirror may introduce FOV/grid-depth
   compression, subject scaling, fitting translation, floating, shear, or a secondary
   projection path.

2. **The aperture is a final authored mask.** After corridor admission, exact reflection,
   facing resolution, and canonical projection, the live raster is clipped to the
   frame-owned glass polygon. Pixels outside that polygon are absent. The aperture never
   feeds back into subject position, scale, or depth. An exact-size knight partially seen
   through a small oval is correct; a shrunken knight fitted inside that oval is not.

3. **Small mirrors may intentionally crop.** The current `mirror-keep`,
   `mirror-court-oval`, `mirror-chapel-glass`, and `mirror-witch-eye` families are small
   authored mirrors. Their generated frame and glass shapes may show a head, torso, or
   other partial silhouette at a valid reflected seat. A cropped top, base, or side is not
   a fit defect when it follows directly from the authored aperture and the unmodified
   exact reflection.

4. **Grand Gallery is a full-body mirror.** The current `mirror-grand-gallery` family is
   explicitly full-body. Its mirror-bearing visual wall variant, generated panoramic
   frame, and continuous glass aperture must grow upward enough to contain the complete
   tallest resolved physical-unit silhouette at 1:1 and its exact reflected floor anchor
   on both north and west wall faces. Any future asset presented as a full-body mirror
   inherits the same requirement.

5. **Tall mirror-bearing walls remain visual relief.** A full-body mirror assembly may
   spill above the ordinary wall silhouette and cell frame. Its logical wall plane,
   contact footprint, anchor, span, supporting edges, and visibility corridor remain
   unchanged. Ordinary walls and intentionally small mirror variants do not need to match
   the full-body height.

6. **Generated material owns aperture geometry.** Enlarging a full-body mirror means
   regenerating or extending its mirror-specific source, face-projected frame, and glass
   pixels. Runtime CSS, SVG, gradients, code-painted extensions, or nonuniform asset
   stretching remain ineligible. Conversely, a small authored mirror is not enlarged
   merely because a unit is taller than its aperture.

7. **Studio proves both roles.** Grand Gallery requires a board-scale proof on both wall
   faces showing the tallest accepted unit's complete silhouette at the exact 1:1 size
   and floor anchor, with aperture bounds visible. Small-mirror proofs must show that their
   partial silhouettes are aperture clips of that same exact-size placement, not scaled
   or shifted fits. Exact depth and subject size remain fixed invariants, never sliders.

8. **All other live-mirror rules remain unchanged.** ADR-0081's wall-specific facing and
   raster chirality, ADR-0080's corridor and continuous multi-span composition, live-only
   physical-piece scope, shared planning, material/live-state separation, painter order,
   and cross-renderer behavior remain in force.

This decision supersedes ADR-0082. It changes only ADR-0082's universal full-height
aperture requirement: complete-silhouette containment now belongs to Grand Gallery and
other explicitly full-body mirror assets, while small authored mirrors may crop. Exact
position, 1:1 size, floor contact, prohibited fit transforms, generated-material rules,
and the taller mirror-bearing wall option remain unchanged.

### Consequences

- Good: every mirror obeys one legible game-world reflection transform regardless of
  frame size.
- Good: small mirror silhouettes remain intentional art rather than being enlarged into
  generic full-body windows.
- Good: Grand Gallery retains the tall wall and aperture needed for the owner's full-size
  knight and tallest-unit expectation.
- Cost: review and regression evidence must distinguish exact reflection geometry from
  authored aperture coverage.
- Cost: full-body claims require a stricter asset-height proof than intentionally small
  mirror variants.

## Pros and Cons of the Options

### Full-height containment for every mirror

- Good: every visible reflection can show a complete unit.
- Bad: destroys the intended scale and silhouette of small mirror designs.
- Bad: confuses the universal spatial transform with an asset-specific coverage promise.

### Exact reflection with authored small/full-body aperture roles

- Good: keeps physics invariant while allowing distinct frame designs.
- Good: makes a small mirror's crop predictable and a full-body mirror's coverage
  testable.
- Bad: requires role-aware visual proofs rather than one universal aperture-height gate.

### Per-aperture fitting

- Good: can force a complete silhouette into any glass shape.
- Bad: reintroduces the scaling, shifting, or depth compression explicitly retired by
  ADR-0082.

## More Information

- Superseded decision:
  [ADR-0082](0082-wall-mirrors-are-exact-one-to-one-game-world-reflections.md)
- Facing and chirality:
  [ADR-0081](0081-wall-mirrors-reflect-piece-facing-in-board-grid-space.md)
- Corridor and projection predecessor:
  [ADR-0080](0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md)
- Derived current-state contracts:
  [Board render contract](../board-render-contract.md) and
  [Asset generation contract](../asset-generation-contract.md)
- Owner-operated instrument rule:
  [ADR-0071](0071-the-deliverable-is-the-instrument.md)
