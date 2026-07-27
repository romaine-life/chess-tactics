---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_supersedes: "[ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md)'s source-only projection and installation clauses"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0106](0106-installed-content-is-database-owned.md)"
  - "[ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md)"
  - "[ADR-0151](0151-source-art-review-requires-interactive-board-placement.md)"
---

# ADR-0173: Structure source-art turntables are complete source-only live groups

## Context and Problem Statement

Floating Artwork can select a distinct installed raster for each of the
canonical eight directions. The ten structure sources that predated that
feature expose only their old south-facing prop/doodad halves, while
owner-supplied Blender archives add castles, mills, and a waterfall landscape
that are useful visual references but do not have honest gameplay footprints,
terrain rules, or collision.

These meshes are placeholder composition input for later image-to-image work.
They still need exact source provenance, complete turntables, owner review, and
a repeatable way to add the next model. Inventing prop definitions for
landmarks or accepting individual facings would make the installed library
incomplete and would conflate visual source art with gameplay objects.

ADR-0150 established the complete atomic turntable and source-only drawable,
and ADR-0151 moved owner review into interactive board context. This record
keeps both decisions and tightens their persistence and projection boundary:
source-only rows are complete live groups, shared readers normalize their
gameplay-only fields, and no prop-seat or gameplay projection may infer policy
for them.

## Decision Outcome

Structure source artwork uses a typed eight-view live-media batch:

- the canonical directions are `south`, `south-west`, `west`, `north-west`,
  `north`, `north-east`, `east`, and `south-east`;
- one fixed orthographic camera and lighting rig renders the grounded model
  through a complete +Z turntable at 512×512 with transparent background;
- each direction is one full `flat-contact` source raster assigned to both of
  that direction's structure media roles. Legacy `back`/`front` roles and their
  prop/doodad split behavior remain unchanged;
- all eight stable slots belong to one database-declared acceptance group.
  Review and pointer promotion cover the complete group atomically; a partial
  turntable is never installed as a source-art drawable;
- exact provider or owner-supplied source bytes are archived privately before
  the candidates. Sources larger than the backend's bounded request body are
  stored as hash-verified chunks plus a canonical manifest and are
  reconstructed transparently for rendering;
- Git owns the text batch specification and deterministic Blender recipe, never
  the source archives, rendered candidates, accepted bytes, or pointers; and
- the Studio Source Art instrument proves native 1× decode and every selected
  direction through interactive board placement, records hash-and-slot-pinned
  owner review, accepts the eight candidates atomically, and only then installs
  or updates the structure drawable record.

A structure drawable may declare `sourceOnly: true`. Source-only records:

- appear in structure source-art selection and review surfaces;
- may use `structureKind: landmark`;
- require no terrain eligibility, blocking value, footprint, prop seat, or
  doodad definition; and
- never synthesize a gameplay prop or doodad and never appear as a Prop Seat
  creation source.

Shared readers normalize gameplay-only fields on a source-only record to empty
terrain eligibility and non-blocking behavior. They do not infer, require, or
synthesize placement policy that the record intentionally omits.

Existing trees, houses, rocks, and doodads retain their current gameplay
definitions and old south runtime pixels. Their new directional media is used
only by structure source artwork. Newly supplied landmarks are source-only from
their first installed revision.

Owner-supplied archives with no embedded license file are recorded as
owner-supplied with license unspecified. The pipeline does not guess or upgrade
their rights.

## Consequences

- Every newly installed structure source-art item has real eight-way rotation.
- Castles and landscape references can be used without fake tiles, seats, or
  collision policy.
- The existing prop/doodad creation system and its installed art remain intact.
- Adding a future model is a manifest entry plus one batch run and owner review,
  not a new code path.
- Raw Blender turntables remain honest placeholder/reference pixels; they do
  not claim to be final indie-game production art.

## More Information

- Refines [ADR-0071](0071-the-deliverable-is-the-instrument.md),
  [ADR-0085](0085-runtime-assets-are-live-storage-backed.md), and
  [ADR-0106](0106-installed-content-is-database-owned.md), plus
  [ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md)
  and [ADR-0151](0151-source-art-review-requires-interactive-board-placement.md).
- Partially supersedes ADR-0150 only where this record tightens source-only
  projection and installation; ADR-0151's interactive placement proof remains
  authoritative and is refined, not superseded.
- Gameplay prop and doodad projections remain governed by their existing
  contracts; `sourceOnly` explicitly remains outside those projections.
