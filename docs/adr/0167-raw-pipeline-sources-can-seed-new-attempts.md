---
status: superseded by ADR-0168
date: 2026-07-24
deciders: Nelson, Codex
superseded_by: "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
partially_supersedes:
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)'s requirement that every new attempt bind a Source Artwork and its prohibition on new work from historical artifacts"
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s Generation-Reference-only attempt input, raw-source-action prohibition, and historical-raw prohibition"
refines:
  - "[ADR-0109](0109-predrawn-generation-packets-preserve-authored-level-semantics.md)"
  - "[ADR-0156](0156-named-predrawn-candidate-refinements-are-separate-non-isolated-branches.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
---

# ADR-0167: Raw Pipeline Sources can seed new attempts without reclassification

## Context

ADR-0166 deliberately kept a level-derived Generation Reference distinct from
the AI-painted Raw Pipeline Source returned by the model. It required every
iterative run to install an AI result, save the Level, and capture a new
Generation Reference. That preserves honest types, but it imposes a pointless
round trip when the exact image the owner wants to give the model is already a
retained Raw Pipeline Source in the Board Art Pipeline.

The first retained pipeline slot may also be a migrated historical attempt. Its
original model input is unknowable, so that attempt correctly remains
inspection-only. Its exact Raw Pipeline Source bytes are nevertheless known and
already stored. Requiring the owner to download and upload those same bytes, or
to reclassify them as a Generation Reference, adds work while making provenance
less precise.

## Decision

### Attempts have a discriminated image-input role

Every writable creation attempt binds exactly one immutable image input with one
of two explicit roles:

- `generation-reference`: a `kind='source'` Generation Reference captured from
  the canonical saved Level under ADR-0166; or
- `raw-pipeline-source`: an existing content-complete `kind='raw'` Raw Pipeline
  Source from another attempt for the same document and Level.

The role is part of the server-owned attempt request. The request records the
exact input version identity and content hash, its owning attempt and stage when
the role is `raw-pipeline-source`, the current saved canonical semantic request
and hashes, request hash, actor/time, and non-isolated provenance. A raw-seeded
attempt never claims that the prior image's missing Generation Reference,
external prompt, model, parameters, or original semantic request are known.

The canonical semantic request captured when the new attempt is created owns
grid geometry, topology, footprints, and gameplay meaning. A reused raw image
owns appearance evidence only and cannot override that request. The resulting
attempt is explicitly ineligible as isolated-pipeline evidence.

### Raw reuse is a reference, not a media mutation

An eligible Raw Pipeline Source exposes **Start new attempt from this image**.
The authorized, fenced backend transaction creates a separate waiting attempt
whose input role is `raw-pipeline-source` and whose input points to that exact
stored version and Blob. It does not:

- mutate the source attempt or artifact;
- reclassify `kind='raw'` as `kind='source'`;
- allocate a duplicate background-version or Blob;
- upload, crop, resize, transcode, or otherwise rewrite the image; or
- fill the new attempt's output slot.

The existing version remains the Raw Pipeline Source of its original attempt.
The new relationship is model-input provenance, not deterministic raster
parentage. The input reference pins the retained version and Blob, and creating
the attempt consumes only one attempt-row allocation until the owner commits a
new result.

The new slot identifies its origin as **AI pipeline source · Slot N** and offers
**Copy pipeline source** for the exact stored PNG. The owner performs the same
manual Codex handoff as a Generation-Reference attempt, stages the returned PNG,
and chooses **Use this board** to commit a new, distinct Raw Pipeline Source in
the new attempt. The original slot remains unchanged.

This is a narrow Raw Pipeline Source action, not generic source promotion.
Warped and occlusion-ready artifacts cannot seed attempts. A Generation
Reference remains a Generation Reference; a Raw Pipeline Source remains a Raw
Pipeline Source.

### Historical source artifacts may seed a separate attempt

An attempt marked `missing-historical-source` remains inspection-only. It still
cannot accept a paste, fill a missing stage, rerun its original generation, or
claim reconstructed provenance. Its exact retained Raw Pipeline Source may,
however, seed a separate new writable attempt through the action above.

That child binds the current saved canonical semantic request and records the
historical raw version and hash as its non-isolated input. This permits honest
new work without fabricating or repairing the historical attempt.

### Relationship to comparative refinement

ADR-0156's named localized comparative-refinement path remains available when a
request uses both a canonical Generation Reference and a subordinate prior
candidate. A raw-seeded attempt is a separate, general non-isolated retry path:
it has one raw image input plus the current canonical semantic request, preserves
exact parent provenance, and never counts as isolated-pipeline evidence.

## Consequences

- The owner can continue from retained AI-painted art without a hard-drive
  round trip or re-uploading the same bytes.
- Generation References and Raw Pipeline Sources remain visibly and durably
  distinct.
- Historical artifacts become useful inputs without pretending their missing
  history has been recovered.
- The exact reused bytes are attributable without duplicate media storage.
- Deterministic warp and occlusion lineage inside each attempt remains linear
  and unchanged.

## Verification

Contract-complete implementation proves that:

- **Start new attempt from this image** appears on an eligible Raw Pipeline
  Source and never on warped or occlusion-ready artifacts;
- the child attempt records `raw-pipeline-source`, the exact input version and
  hash, owning slot, current canonical semantic request and hashes, actor/time,
  and non-isolated provenance;
- the source row, Blob, original attempt, hashes, and statuses remain unchanged,
  and no media row, upload, or Blob copy occurs when the child is created;
- a historical Slot 1 Raw Pipeline Source may seed a child while Slot 1 itself
  remains inspection-only;
- **Copy pipeline source** reads the exact stored full-resolution PNG;
- committing the returned PNG fills only the child attempt's one Raw Pipeline
  Source output slot; and
- cross-owner, cross-document, cross-Level, wrong-kind, missing-content, stale
  writer, and idempotency mismatches fail closed.
