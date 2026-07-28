---
status: accepted
date: 2026-07-24
deciders: Nelson, Codex
refines:
  - "[ADR-0163](0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
---

# ADR-0169: Historical raw contracts bind only from saved-Level proof

## Context

ADR-0168 makes an immutable Raw Pipeline Source the reusable input of each
deterministic Board Art creation slot. Some retained historical `kind='raw'`
versions predate the complete raw-source contract. Their bytes, content hash,
dimensions, world bounds, legacy geometry digest, and original provenance are
known, but their immutable operation metadata does not contain the later
`coordinateBasis` and `viewingPane` fields.

Rewriting those historical operation or provenance objects would falsely claim
that the fields were recorded when the image was created. Rejecting every such
row would instead strand exact retained pipeline inputs even when the saved
Level proves the missing coordinate relationship. Treating missing metadata as
an implicit default is also unsafe: a raw image with another frame or board
layout must not become eligible through browser inference.

ADR-0163 already establishes the pattern for this repair. Immutable historical
claims remain untouched; a separate attributable binding may normalize them
only at an authorized server-held proof boundary.

## Decision

### Immutable external raw-contract binding

Postgres owns an external one-row-per-version raw-contract binding for eligible
historical Raw Pipeline Sources. The binding records:

- the exact editor-document and raw-version identities;
- the historical raw operation kind and canonical operation hash;
- the established `board-world-pixels-v1` coordinate basis;
- the exact viewing pane proven from the stored bounds and saved generation
  frame; and
- the authenticated actor and binding time.

The binding is external to `predrawn_background_versions`. It never rewrites,
merges, or supplements the stored operation or provenance JSON in place. The
raw bytes, Blob identity, lifecycle state, dimensions, world bounds, lineage,
and every historical hash remain unchanged. Those immutable version facts, the
separate ADR-0163 geometry binding, and the saved canonical Level remain the
proof records rather than being duplicated into this sidecar.

The binding is immutable. An idempotent retry may observe the same complete
mapping; any different mapping for that raw version is a conflict. It supplies
only the historically absent coordinate-basis and viewing-pane contract. It
cannot override a present but contradictory value, fabricate `untouched`
provenance, repair a content mismatch, or generalize to a different Level.

All newly created Raw Pipeline Sources continue to record the complete current
contract directly. They are never permitted to rely on this historical repair.

### One authorized repair boundary

A raw-contract binding may be established only inside the authorized, fenced
transaction that creates a deterministic processing attempt from an existing
Raw Pipeline Source. Before inserting either binding or attempt, the backend
locks and reads the exact saved canonical Level behind the editor document and
proves all of the following:

1. the working copy is at its saved boundary and the document still resolves
   that same canonical Level revision;
2. the raw is owner-, document-, and Level-scoped, content-complete, ready or
   published, and its stored hash exactly matches the retained Blob bytes;
3. its pixel dimensions are valid and its stored world bounds exactly equal the
   saved Level's generation frame, thereby establishing
   `board-world-pixels-v1` plus an identical viewing pane;
4. its stored `predrawn-environment-geometry-v1` digest exactly matches the v1
   digest recomputed from that saved Level;
5. ADR-0163's immutable v1-to-v2 geometry binding either already matches or is
   established atomically from the same proof; and
6. its original operation/provenance hashes and retained historical lineage
   still identify those exact bytes as the untouched raw input being selected.

Only after every proof succeeds may the transaction establish the external
raw-contract binding and create the slot with that exact raw input. Both writes
commit atomically. If attempt creation fails, no binding remains; if binding
conflicts, no attempt is created.

A GET, list, picker open, content fetch, observer session, autosave, Save,
Publish, or unrelated derivative never creates this binding. The browser cannot
supply, repair, or attest any proof field. An unsaved Level, missing historical
fact, mismatched frame or bounds, v1 geometry mismatch, content/provenance
mismatch, wrong scope, stale writer fence, or concurrent canonical change fails
closed.

### Server-owned picker eligibility and colocated feedback

The backend projects Raw Pipeline Source eligibility and a concrete issue when
ineligible. The picker consumes that projection; it does not reconstruct
eligibility from operation JSON, infer defaults, or treat every `kind='raw'`
row as usable.

An unbound historical source may be offered only when the server can establish
the proof above during fenced attempt creation. Because a list read is
side-effect free, an eligible historical source means eligible for that later
fenced proof, not already repaired.

Eligibility or creation failure is displayed beside the affected source in the
**New attempt** chooser and keeps that chooser open. A disabled action without
an explanation, a remote global banner, a generic toast, or silently omitting
the retained source is insufficient. If the fenced create recheck fails after
the picker was rendered, the returned server reason replaces the source's
colocated status.

## Consequences

- Historical raw pixels and provenance remain immutable while exact, provable
  sources can participate in ADR-0168's reusable-input workflow.
- Coordinate metadata is never guessed from a browser or silently backfilled by
  a read.
- The attempt-creation transaction is the single auditable boundary at which
  the repair can become durable.
- The owner can see why a retained source is or is not selectable at the point
  where the choice is made.

## Verification

Contract-complete implementation proves that:

- a historical raw lacking only `coordinateBasis` and `viewingPane` gains
  exactly one external binding during fenced processing-attempt creation when
  its saved frame/bounds, v1 geometry, bytes, and provenance all match;
- its background-version row, operation, provenance, hashes, Blob, dimensions,
  world bounds, lifecycle state, and historical slot remain byte-for-byte
  unchanged;
- the same transaction may establish the matching ADR-0163 v1-to-v2 binding and
  creates the new slot only when both bindings succeed;
- a repeated identical request reuses the binding, while any conflicting
  mapping fails without creating a slot;
- new raw sources and historical rows with contradictory rather than absent
  metadata cannot use this repair;
- GET/list/picker/observer/Save/Publish paths never insert a raw-contract
  binding;
- server-projected eligibility and concrete issue fields, rather than browser
  metadata inference, govern every source choice; and
- every picker and fenced-create rejection is shown beside the affected source
  without losing the owner's current chooser state.
