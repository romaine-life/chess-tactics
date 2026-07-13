---
status: "superseded by ADR-0085"
date: 2026-07-12
deciders: Nelson, Codex
---

# ADR-0084: Full-body mirrors prove grounded board-axis line of sight

> **Superseded by
> [ADR-0085](0085-mirror-surfaces-end-at-the-wall-floor-boundary.md)
> (2026-07-12).** ADR-0085 keeps this grounded board-axis crossing construction and
> exhaustive alpha proof, but classifies crossings below the generated wall/floor seam
> as floor-occluded and clips every mirror layer to the real wall-face support. Those
> pixels no longer count as supported-glass hits.

## Context and Problem Statement

ADR-0083 requires Grand Gallery to contain a complete exact-size reflected unit, but its
first proof checked only whether the virtual reflected raster overlapped the glass. The
implementation then moved the entire mirror from its ordinary lower mount to slot `y=-4`
so that raster would fit. A physical-to-virtual head line remained parallel to projected
grid X, but most of the physical knight's board-axis crossings hit wall below the raised
glass. The proof established virtual position while failing to establish that the mirror
occupied the semantic wall location connecting the physical and virtual pieces.

This game deliberately uses board-grid mirror logic rather than a viewer-dependent real
camera. Its proof therefore needs a complete, viewer-independent definition of “the
piece can see the mirror along the wall normal.”

## Decision Drivers

- The west mirror convention must remain grid X and the north convention grid Y.
- Every visible part of a unit claimed to fit a full-body mirror must cross actual glass,
  not frame, unsupported overhang, empty space, or ordinary wall material.
- The test must use the complete opaque rendered silhouette, not one head landmark.
- The exact virtual position, 1:1 raster size, facing, and floor anchor from ADR-0083 must
  remain independently true.
- Directional sprites are separate authored images, so a proof must not invent
  pixel-to-pixel anatomical correspondence between physical and reflected facings.
- Art must solve insufficient coverage by grounding the lower rail and growing generated
  frame/glass above it, never by lifting the whole mirror to chase the virtual raster.

## Considered Options

- Keep the physical-to-reflected raster-head angle comparison.
- Treat overlap of the virtual raster and screen-space aperture as sufficient.
- Add a perspective or camera-aware physical mirror model.
- Translate every opaque physical billboard pixel along the board wall normal, test its
  wall-plane crossing against supported glass, and retain the exact virtual-raster test
  separately (chosen).

## Decision Outcome

Chosen: **a full-body mirror must pass both exact virtual-raster containment and an
exhaustive grounded board-axis wall-crossing proof.** The crossing proof treats the live
piece's physical draw as a board-anchored billboard and never pairs its pixels with a
different directional sprite.

For every opaque destination-pixel center `p` in the current physical draw operation:

```text
west wall: wallSeat = project(-0.5, subject.y)
north wall: wallSeat = project(subject.x, -0.5)
hitShift = wallSeat - subject.seat
wallHit = p + hitShift
semanticVirtual = p + 2 * hitShift
```

The implementation follows these rules:

1. **Every opaque physical pixel is classified.** The proof reproduces the live draw's
   destination rectangle, `contain` fit, and source alpha sampling. Transparent source
   pixels do not participate. A handful of representative rays may explain the geometry,
   but the pass/fail result comes from the complete wall-hit silhouette.

2. **A hit needs glass and supporting wall.** The subject must be inside the existing
   half-open tangent corridor. Its `wallHit` must lie inside the complete authored
   aperture and inside the union of the aperture's supporting-segment clips. Decorative
   overhang cannot make an unsupported hit valid.

3. **The explanatory virtual endpoint is semantic, not raster correspondence.** The
   midpoint relation between `p`, `wallHit`, and `semanticVirtual` shows the intentional
   board-axis convention. The separately authored directional raster selected for the
   visible reflection remains the runtime result and is not used as proof input.

4. **Full-body mirrors pass two independent coverage gates.** Grand Gallery and future
   full-body mirrors must contain the exact reflected raster at its ADR-0083 virtual seat
   and must classify every accepted physical silhouette wall hit as supported glass on
   both faces. Passing one gate cannot compensate for failing the other.

5. **Small authored mirrors retain ADR-0083 cropping.** Keep, Court, Chapel, and Witch's
   Eye may report partial wall-crossing coverage and crop the exact-size virtual raster.
   They must not scale, shift, or compress the subject to improve that result.

6. **The lower rail is the invariant art datum.** The current Grand Gallery uses grounded
   slot `y=72` on both faces. Its generated bottom rail stays at the wall/floor datum and
   its generated side rails, glass, and top rail extend upward. Moving the whole assembly
   to `y=-4` to fit the virtual raster is retired. The existing tall supporting-wall
   geometry remains sufficient for the upward extension.

7. **Studio is the owner-operated proof.** The Wall Art instrument overlays the actual
   aperture, a teal/red wall-hit silhouette for every opaque pixel, representative
   physical-to-wall and wall-to-semantic-virtual rays, and per-face counts. Automated
   acceptance pins the source raster and fails on any blocked pixel.

8. **This is not a camera model.** No viewer pose, perspective ray, secondary projection,
   foreshortening, or camera-dependent visibility enters the shared reflection planner.
   The deliberate isometric board-axis convention remains the product rule.

This decision refines ADR-0083 without superseding it. ADR-0083 continues to govern exact
virtual placement, size, facing, final aperture clipping, and small/full-body roles;
ADR-0084 adds the missing grounded semantic-coverage gate for full-body claims.

### Consequences

- Good: the proof now catches the exact failure that a raised mirror hid.
- Good: “full body” means every visible physical part crosses supported glass and the
  complete exact virtual raster remains drawable.
- Good: the result is deterministic, inspectable, and independent of viewer perspective.
- Cost: full-body asset revisions may need substantially more generated glass above a
  fixed grounded rail.
- Cost: proof tooling must rasterize and classify the complete accepted silhouette rather
  than compare a few landmarks.

## More Information

- Exact reflection and aperture roles:
  [ADR-0083](0083-mirror-aperture-coverage-is-authored-per-asset.md)
- Exact position, size, and floor contact:
  [ADR-0082](0082-wall-mirrors-are-exact-one-to-one-game-world-reflections.md)
- Board-axis reflection transform:
  [ADR-0080](0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md)
- Derived contract: [Board render contract](../board-render-contract.md)
- Generated material rules: [Asset generation contract](../asset-generation-contract.md)
