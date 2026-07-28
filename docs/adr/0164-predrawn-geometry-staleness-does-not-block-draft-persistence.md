---
status: accepted
date: 2026-07-20
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
partially_supersedes: "[ADR-0163](0163-legacy-predrawn-geometry-fingerprints-bind-to-cover-independent-v2.md)'s incoming-autosave validation and first baked-geometry edit rejection clauses"
---

# ADR-0164: Pre-drawn geometry staleness does not block draft persistence

## Context

ADR-0163 correctly binds an immutable legacy v1 background fingerprint to its
cover-independent v2 equivalent from the server-held pre-mutation Level. It
incorrectly required the incoming first autosave body to match that v2 digest
and therefore rejected a first baked-environment edit.

A Level Editor working copy and its recoveries must preserve the owner's draft,
including a deliberate intermediate state that is not yet publishable. Editing
baked terrain while an older background remains selected is such a state: the
art becomes stale and needs a new derivative, but rejecting the autosave loses
the very geometry work needed to produce that replacement. Draft durability and
canonical art validity are separate boundaries.

## Decision

At the first eligible fenced autosave, the migration-30 binding continues to use
only the server-held **pre-mutation** Level. An exact v1 reproduction proves that
the immutable legacy row and the calculated v2 digest describe that old Level;
the transaction may then bind every relevant legacy ancestor atomically. That
proof says nothing about whether the submitted next draft still matches the
selected art.

After normal document shape, ownership, session fence, and compare-and-swap
checks pass, autosave persists the submitted working-copy body even when its v2
environment-geometry digest differs from its selected raster or occlusion-ready
artifact. Recovery upload and restore likewise preserve an attributable owner
draft rather than rejecting, deleting, or silently rewriting it because its art
selection is stale. A binding is never recalculated from that stale body and
never blesses the new geometry as equivalent to the old art.

A v2 mismatch is instead explicit draft state:

- the artwork workspace marks the selected version as belonging to an earlier
  environment layout;
- that stale version cannot be newly Set or used as the source of a warp or
  occlusion derivative, so the corresponding Set and derivation controls are
  disabled; and
- the owner may retain the draft while reverting its baked geometry or adding
  and selecting art generated for the current geometry.

Cover-only edits remain non-stale because cover is absent from v2. A baked
terrain, Subterrain, prop, doodad, barrier, or other baked-environment change
changes v2 and produces the stale state above.

Canonical Save and every Publish path remain fail-closed. They compare the
current Level's v2 digest with the exact selected raster and occlusion lineage
and reject a stale selection without changing canonical content or published
media state. Only restoring matching baked geometry or selecting a complete
artifact for the current geometry can satisfy that canonical gate.

## Consequences

- Autosave and recovery remain faithful preservation mechanisms rather than
  premature publication validators.
- The owner can edit baked geometry, leave the editor, recover the draft, and
  return to the artwork workflow without losing work.
- Stale art is visible and inoperable for Set/derivation, so preserving the
  draft does not imply that its old background is valid for the new geometry.
- Save and Publish retain the strict geometry guarantee required by ADR-0158.
- ADR-0163's external binding, immutable metadata, v2-only new-operation rule,
  exact server proof, and no-GET-mutation clauses remain unchanged.

## Verification

- Starting from an unbound matching v1 selection, a first fenced cover edit
  establishes the binding, autosaves, and remains non-stale.
- Starting from the same state, a first fenced baked-geometry edit establishes
  the binding from the pre-mutation Level and autosaves the changed draft; the
  canonical Level remains unchanged.
- Reloading or restoring that draft shows an explicit stale-art state and keeps
  Set, warp, and occlusion derivation unavailable for the stale version.
- Save and Publish reject that stale draft without changing canonical content;
  after matching art is selected or the geometry is reverted, the same boundary
  may succeed.
- A binding row continues to contain the old Level's exact v1-to-v2 proof and is
  not rewritten from the stale draft.
