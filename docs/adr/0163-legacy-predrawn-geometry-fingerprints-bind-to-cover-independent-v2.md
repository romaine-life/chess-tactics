---
status: accepted
date: 2026-07-20
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0164](0164-predrawn-geometry-staleness-does-not-block-draft-persistence.md)"
refines:
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0162](0162-predrawn-backgrounds-retain-live-ground-cover.md)"
---

# ADR-0163: Legacy pre-drawn geometry fingerprints bind to cover-independent v2

## Context

ADR-0162 excludes live ground cover from a pre-drawn background's environment-
geometry fingerprint so an owner can edit cover without invalidating an
otherwise unchanged raster and occlusion artifact. Existing immutable
background versions predate that decision: their
`predrawn-environment-geometry-v1` operation and provenance hashes include the
then-current `cover` and `coverTypes` maps.

Rewriting those immutable rows to a cover-independent hash would falsify their
recorded provenance. Simply comparing them with the new hash would instead
strand valid existing lineages, while accepting either hash without a proven
relationship could let an artifact survive an actual baked-geometry change.
The migration therefore needs to preserve the exact historical claim and add a
durable, auditable normalization only when the server can reproduce it from an
authoritative Level.

## Decision

### Versioned fingerprints

`predrawn-environment-geometry-v2` is the only schema accepted for every new raw,
warped, or occlusion-ready background operation. Its canonical input includes
the baked terrain and environment geometry governed by ADR-0158 and deliberately
omits live `cover` and `coverTypes` data. A cover-only Level edit therefore keeps
the same v2 digest, while a change to terrain, Subterrain, props, doodads,
barriers, or any other baked environment input changes it.

The exact v1 implementation remains available only to validate immutable rows
that already store `predrawn-environment-geometry-v1`. It reproduces the legacy
canonical input, including the actual cover maps. Clients cannot create a new v1
operation, ask the server to downgrade a v2 operation, or use a client-declared
v1 digest as migration proof.

### Immutable external binding

Database migration 30 creates
`predrawn_background_geometry_bindings`. It owns at most one row per immutable
background version and records:

- the version and editor-document identity;
- the exact stored v1 schema and digest;
- the normalized v2 schema and digest;
- the authenticated actor's email and display name; and
- the binding time.

The binding is external to `predrawn_background_versions`. The version's
operation, provenance, hashes, lineage, and other immutable metadata are never
rewritten. The binding row is itself immutable: a retry may observe the same
mapping, but a different mapping for that version is a conflict. A v2 child may
extend a v1 lineage only after every relevant v1 ancestor has this exact v2
binding.

### Authorized binding boundaries

A binding may be created only inside an already-authorized write transaction
where the server holds the Level used for proof:

1. **First fenced working-copy autosave:** before applying the submitted body,
   the server computes both digests from its pre-mutation working-copy Level and
   requires that Level's v1 digest to equal the immutable row's stored v1 digest.
   It then binds every relevant v1 ancestor atomically. The submitted body is
   still validated against the bound v2 digest, so a first cover edit succeeds
   but a first baked-geometry edit fails.
2. **Direct derivative creation:** while creating a new child, the server may
   bind relevant legacy ancestors from the current server-held Level after the
   same exact v1 proof. The new operation itself records v2.
3. **Save or Publish fallback:** if a valid legacy selection has reached a
   canonical boundary without an earlier eligible mutation, the transaction may
   establish the same proof and binding before validating the canonical write.

If the server-held Level does not reproduce the stored v1 digest, binding fails
closed. A read, list, content fetch, page load, observer session, or other GET
never creates a binding, changes attribution, or repairs lineage. Migration 30
therefore adds the durable relation but does not perform an unproven eager
backfill.

Once bound, all selection, derivative, Save, and Publish validation uses the
normalized v2 digest. Subsequent cover edits remain valid without changing the
binding. Subsequent baked-environment edits do not match v2 and require a new
appropriate art derivative; the migration cannot bless them as equivalent.

## Consequences

- Existing accepted raster and occlusion versions remain usable after live
  cover changes without altering their historical operation or provenance.
- The one-time normalization is attributable, transactionally durable, and
  reproducible from a server-authoritative pre-mutation Level rather than a
  browser assertion.
- The first post-upgrade action may be a cover edit: its pre-mutation Level
  proves the legacy row before the incoming cover maps differ from v1.
- A real baked-geometry edit continues to stale the old art, including when it
  is the first post-upgrade mutation.
- Read paths remain side-effect free, and unprovable legacy rows remain visibly
  unavailable instead of being guessed into v2.

## Verification

- A legacy v1 selection whose stored digest matches the server-held Level gains
  exactly one migration-30 binding with the exact v1 pair, normalized v2 pair,
  document, actor, and time; its immutable version row is byte-for-byte
  unchanged.
- The first fenced autosave may change only cover and succeeds after binding;
  the same test with a baked-geometry change is rejected.
- Direct derivative creation and Save/Publish can establish the same binding
  when no earlier eligible mutation has done so, and all relevant legacy
  ancestors are bound atomically.
- New create requests reject v1, and a v2 child cannot extend an unbound v1
  parent.
- GET/list/content requests never insert a binding.
