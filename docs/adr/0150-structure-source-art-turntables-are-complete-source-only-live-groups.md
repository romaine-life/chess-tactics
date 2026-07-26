---
status: "accepted; isolated native-frame review clause superseded by ADR-0151"
date: 2026-07-24
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0151](0151-source-art-review-requires-interactive-board-placement.md)"
---

# ADR-0150: Structure source-art turntables are complete source-only live groups

## Context and Problem Statement

Floating Artwork can already select a distinct installed raster for each of the
canonical eight directions. The ten structure sources that predated that
feature expose only their old south-facing prop/doodad halves, while eight
owner-supplied Blender archives add castles, mills, and a waterfall landscape
that are useful visual references but do not have honest gameplay footprints,
terrain rules, or collision.

These meshes are placeholder composition input for later img2img work. They
still need exact source provenance, complete turntables, owner review, and a
repeatable way to add the next model. Inventing prop definitions for landmarks
or accepting individual facings would make the installed library incomplete and
would conflate visual source art with gameplay objects.

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
  turntable is never installed as an Artwork source;
- exact provider or owner-supplied source bytes are archived privately before
  the candidates. Sources larger than the backend's bounded request body are
  stored as hash-verified chunks plus a canonical manifest and are reconstructed
  transparently for rendering;
- Git owns the text batch specification and deterministic Blender recipe, never
  the source archives, rendered candidates, accepted bytes, or pointers; and
- the Studio's Source Art instrument shows every selected direction at native
  1×, records hash-and-slot-pinned owner review, accepts the eight candidates
  atomically, and only then installs or updates the structure drawable record.

A structure drawable may declare `sourceOnly: true`. Source-only records:

- appear in the Level Editor's Source Artwork shelf;
- may use `structureKind: landmark`;
- require no terrain eligibility, blocking value, footprint, prop seat, or
  doodad definition; and
- never synthesize a gameplay prop or doodad.

Existing trees, houses, rocks, and doodads retain their current gameplay
definitions and old south runtime pixels. Their new directional media is used
only by floating source artwork. The eight newly supplied landmarks are
source-only from their first installed revision.

Owner-supplied archives with no embedded license file are recorded as
owner-supplied with license unspecified. The pipeline does not guess or upgrade
their rights.

## Consequences

- Every installed Source Artwork item has real eight-way rotation.
- Castles and landscape references can be placed without fake tiles, seats, or
  collision policy.
- The existing prop/doodad creation system and its installed art remain intact.
- Adding a future model is a manifest entry plus one batch run and owner review,
  not a new code path.
- Raw Blender turntables remain honest placeholder/reference pixels; they do not
  claim to be final indie-game production art.

## More Information

- Refines [ADR-0145](0145-scenic-artwork-is-free-transform-generation-input.md),
  [ADR-0071](0071-the-deliverable-is-the-instrument.md), and
  [ADR-0085](0085-runtime-assets-are-live-storage-backed.md).
- Runtime placement and selection remain governed by ADR-0147 through ADR-0149.
