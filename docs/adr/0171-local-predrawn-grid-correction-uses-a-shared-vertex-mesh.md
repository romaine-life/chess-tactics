---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0110](0110-owner-fitted-grid-defines-predrawn-review-rectification.md)"
  - "[ADR-0134](0134-predrawn-candidate-review-uses-exact-board-plane-registration.md)"
  - "[ADR-0135](0135-predrawn-registration-is-owner-picked-source-geometry.md)"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0111](0111-predrawn-refit-target-dimensions-are-owner-configurable.md)"
  - "[ADR-0113](0113-predrawn-calibration-can-snap-to-the-canonical-grid-shape.md)"
  - "[ADR-0114](0114-predrawn-calibration-keeps-an-independent-pinned-boundary.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0170](0170-derived-board-inspection-is-a-full-workspace-revision-gate.md)"
---

# ADR-0171: Local pre-drawn grid correction uses a shared-vertex mesh

## Context

Four-corner placement and shared row and column guides efficiently fit the
overall grid of an AI-painted board. Some otherwise acceptable paintings have
small, local line drift that is not separable by row and column: correcting one
four-cell area with a whole guide damages areas that already align.

ADR-0110 intentionally rejected arbitrary point correction because independent
cell and object warps can split a continuous painting, fold cells, and conceal
semantic generation failures. The owner now needs a finer instrument, but those
failure modes remain unacceptable.

## Decision

### Local editing is one continuous shared-vertex mesh

The existing named corners and monotonic row and column guides remain the
coarse-fit controls. An optional local-refinement mode exposes the logical grid
as a mesh whose intersections are shared by every adjacent cell.

The owner selects a cell and sees its four corner intersections. Interior
intersections are adjustable and affect every cell that shares them. All
board-boundary intersections remain visibly locked to the coarse corner and
guide controls so local refinement cannot distort surrounding scenery. There
are no independent copies of a corner per cell, no seams between neighbors,
and no per-object or per-layer correction.

The fitted registration stores only sparse overrides for moved shared
intersections. Each override is identified by its integer logical column and
row, must be strictly inside the logical grid, and records the exact
source-image pixel selected by the owner. Stable
row-major ordering and deterministic numeric normalization make equivalent
registrations byte-identical. Version 5 owns this payload and permits at most
1,024 sparse overrides, keeping the complete derivative operation below the
backend's 64 KiB operation limit. Earlier registration versions remain
readable and mean that no local overrides exist.

### The transform remains deterministic and continuous

For each grid intersection, the coarse corner-and-guide fit supplies the base
point unless a sparse local override supplies an exact source-pixel point. The
transform converts those points into the projective board plane and uses
piecewise bilinear interpolation within each logical cell before returning to
source pixels. With no overrides, this is exactly the existing separable
row/column transform and uses its unchanged evaluation path.

Every adjacent cell therefore evaluates its shared edge from the same two
vertices. The same continuous map rasterizes the complete source image,
including scenery outside the playable board. Coordinates outside the logical
grid use the unchanged coarse guide map. Because every boundary-node local
offset is zero, the interior mesh meets that outside map continuously at the
board boundary rather than receiving a separate crop, fill, or layer treatment.
Runtime still receives one immutable derived raster; it does not execute or
retain a live mesh warp.

Because the raster algorithm has gained a new versioned input, a child whose
registration contains local refinements identifies its operation as
`grid-warp-v2` and its provenance processor as
`shared-predrawn-rasterizer-v2`. The backend canonicalizes and validates its
version-5 registration before accepting it. A version-1 through version-4
registration continues to use `grid-warp-v1` /
`shared-predrawn-rasterizer-v1` and the exact prior evaluator. Both immutable
pairs remain readable, selectable, and publishable; crossed registration and
algorithm versions fail closed.

### Invalid geometry fails closed

All mesh coordinates must be finite, inside the source image, and addressed to
the registration's exact grid dimensions. Every affected cell must keep a
non-degenerate, consistently oriented, non-self-intersecting quadrilateral.
A drag or keyboard nudge is clamped to the furthest valid point or rejected; it
may never fold a cell, cross a shared edge, or change grid topology.

Coarse controls and local controls edit the same registration and must satisfy
the same whole-mesh validation. A grid-dimension change cannot silently
reinterpret local overrides: it requires explicitly clearing them. Restoring
the opening fit restores its local overrides as well, while clearing local
refinements removes only the sparse overrides.

### The instrument makes shared effects legible

The full grid-fitting workspace has explicit coarse-grid and local-cell modes.
Local mode lets the owner select a cell, shows its four shared vertex handles,
visibly locks boundary handles, and highlights neighboring cells affected by
the selected interior vertex. Dragging is the primary adjustment; arrow keys
nudge one source pixel and Shift+Arrow nudges ten. The workspace offers reset
actions for the selected vertex, selected cell, and all local refinements, and
explains when a reset also changes neighboring cells.

This correction remains geometric calibration, not semantic rescue. Missing
houses, moved rivers, invented cliffs, or other object/content failures still
require another generated source.

## Consequences

- The owner can repair isolated line drift without moving an otherwise correct
  entire row or column.
- Neighboring cells cannot separate because they never own duplicate corners.
- Sparse source-pixel evidence remains inspectable, compact, versioned, and
  deterministic.
- Local correction is more meticulous than coarse fitting, so the default
  workflow stays corners first, rows and columns second, local cells only where
  needed.
- ADR-0110's prohibition on arbitrary per-intersection correction and its
  row/column-only definition of generation failure are superseded by this
  constrained shared-mesh model. Its prohibition on independent object,
  layer, or disconnected-cell warps remains in force.
- ADR-0134 and ADR-0135's per-cell prohibitions are superseded only for these
  shared intersections in one continuous complete-raster map; their
  independent-cell and independent-object prohibitions remain in force.

## Verification

Contract-complete implementation proves that:

- version-1 through version-4 registrations retain their exact prior mapping,
  while the new version round-trips sparse shared nodes deterministically;
- changing one shared node changes the raster mapping, keeps common edges
  identical, and cannot produce a folded or degenerate affected cell;
- source scenery outside the board remains part of the same deterministic
  transform and retains the exact coarse map;
- the backend rejects non-canonical, oversized, out-of-range, and folded
  version-5 registrations while continuing to validate historical v1
  derivatives;
- cell selection, shared-neighbor highlighting, dragging, pixel nudging, and
  vertex/cell/all-local reset controls work in the full fitting workspace; and
- generating a warp persists the exact mesh registration and emits one
  immutable raster child suitable for the existing full-size inspection gate.
