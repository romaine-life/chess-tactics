---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes: "[ADR-0472](0472-forest-generation-bounds-ground-contact-not-sprite-frames.md)'s frame-derived footprint sizing"
refines:
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0173](0173-structure-source-art-turntables-are-complete-source-only-live-groups.md)"
  - "[ADR-0464](0464-forests-are-saved-rerunnable-generator-instances.md)"
---

# ADR-0473: Source-art ground contact is measured from base alpha

## Context

ADR-0472 correctly separated a Forest item's ground-contact bounds from its complete sprite, but
its temporary 80%-of-frame ellipse still guessed the base from the same 512x512 rectangle the
decision meant to exclude. More importantly, the source-art installer wrote `(256,256)` as every
direction's anchor. Accepted trees actually meet the ground roughly 100–160 pixels lower, and the
contact shifts horizontally between rendered facings. A candidate whose guessed anchor fits can
therefore draw its visible trunk or roots outside the selected cells.

The transparent accepted raster contains the relevant evidence. Its bottom opaque contact band is
the trunk/root/ground mass; the crown, branches, and unused transparent frame are above or outside
that band.

## Decision

- Each source-art direction owns explicit `anchorX`, `anchorY`, and `groundFootprint` geometry.
  The geometry is direction-specific; no shared frame-centre anchor is inferred across a turntable.
- The canonical source-art build measures that geometry from the native transparent raster. Alpha
  at least 32 is visible. The bottom row must contain at least the greater of two pixels or 0.4% of
  frame width, avoiding isolated antialias specks. The native raster's final 8% ending at that row
  is the base contact band. Its alpha bounds define the contact footprint and its centre defines
  the anchor.
- Candidate metadata carries the measured geometry. Installing the accepted group copies it into
  each direction's live drawable behavior. The south-facing contact also becomes the nominal
  geometry for a new source-only drawable; an existing prop's authored base geometry is unchanged.
- Current accepted natural source art predates that metadata. Deterministic per-direction
  calibrations measured from those exact accepted rasters backfill it until those rows are next
  reinstalled. An explicit live per-direction contact always wins.
- Forest containment applies the measured and scaled base ellipse. The image rectangle, transparent
  gutters, canopy, branches, and every other elevated pixel remain irrelevant and may overhang.
  Only uncalibrated legacy art may use a conservative fallback, and current Forest catalog art is
  calibrated.
- Existing generated Forest output changes only on Generate or Regenerate.

## Consequences

- A tree is seated where its rendered trunk actually reaches the ground, so the boundary check and
  the visible base refer to the same place.
- Rotation may move both the stored image centre and the root footprint while preserving the same
  intended ground point.
- Very broad ground-level sources retain broad contact geometry; a broad canopy alone does not.
- Future source-art batches acquire their contact geometry automatically from the candidates that
  are reviewed and installed.
