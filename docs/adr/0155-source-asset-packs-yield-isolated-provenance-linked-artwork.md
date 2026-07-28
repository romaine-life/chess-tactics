---
status: "accepted"
date: 2026-07-25
deciders: Nelson, Codex
---

# ADR-0155: Source asset packs yield isolated provenance-linked Artwork

## Context and Problem Statement

Owner-supplied source archives may contain a library of independently useful
models rather than one assembled prop. Rendering the complete library as one
turntable produces a scattered scene that cannot be placed meaningfully.
Uploading the same archive once per extracted model also duplicates large
private source bytes without adding provenance.

Rigged sources and current Blender exporters introduce two more deterministic
source concerns: a useful static pose may live at an authored animation frame,
and color and opacity maps may be exported as separate images.

## Decision Outcome

The structure source-art pipeline may declare multiple Artwork identities from
one exact owner archive:

- each identity names an exact allowlist of authored mesh objects; a multi-part
  object such as a trunk plus its matching branches remains one complete scene
  and is transformed as a whole;
- every isolated identity receives its own complete eight-direction candidate
  group and independent owner review;
- all identities from the same pack reference one archived, hash-verified
  source version rather than duplicating the archive bytes;
- optional authored animation frame and complete-subject yaw values are applied
  before the turntable and recorded in candidate provenance;
- external base-color and separate opacity images are preserved when Blender
  importer shader graphs are normalized; and
- a malformed source that cannot produce a legible static subject is excluded
  from review instead of being presented as an approvable asset.

Git owns the object allowlists, pose/yaw values, labels, and deterministic
recipe. Source archives and rendered pixels remain live-storage-backed under
ADR-0085 and ADR-0150.

## Consequences

- A mushroom, tree, or rock pack becomes individually placeable Artwork instead
  of one scattered composite.
- Shared source provenance remains exact without redundant large uploads.
- Review still makes no partial-group exception: every isolated Artwork item
  must supply and pass all eight directions.
- Source defects remain visible as pipeline exclusions rather than becoming
  cleanup work for the owner inside the approval UI.

## More Information

- Refines [ADR-0150](0150-structure-source-art-turntables-are-complete-source-only-live-groups.md)
  and [ADR-0151](0151-source-art-review-requires-interactive-board-placement.md).
- Uses the deterministic-geometry and live-pixel boundary established by
  [ADR-0040](0040-feature-tiles-own-geometry-generate-material.md) and
  [ADR-0085](0085-runtime-assets-are-live-storage-backed.md).
