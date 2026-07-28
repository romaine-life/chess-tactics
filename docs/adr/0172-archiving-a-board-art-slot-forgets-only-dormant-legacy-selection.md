---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
refines:
  - "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
  - "[ADR-0158](0158-immutable-predrawn-background-versions-own-derived-raster-and-occlusion.md)"
  - "[ADR-0165](0165-ai-artwork-separates-sources-attempts-and-background-mode.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
---

# ADR-0172: Archiving a board-art slot forgets only dormant Legacy selections

## Context

A creation slot can own the raster or occlusion-ready version remembered by the
Level even while the Level is displaying Legacy art. That remembered selection
is useful while switching between Legacy and AI, but it also pins the slot as
apparently in use. The existing **Archive slot** action therefore became
disabled even though archiving could not change the currently visible Legacy
board.

Leaving the action disabled gives the owner no way to retire an unwanted slot.
Silently preserving the remembered selection would leave a dangling hidden
reference, while clearing it in a separate browser autosave could race the
archive and restore the reference.

## Decision

### The existing archive action owns the complete intent

**Archive slot** is the one owner-facing action. It does not gain a parallel
force-delete or detach button.

For both the current working Level and its saved canonical Level, the backend
checks whether the remembered pre-drawn selection contains a version owned by
the slot:

- if either matching Level is in AI background mode, archive fails closed
  because that Level is actually using the slot;
- if a matching Level is in Legacy background mode, archive removes that
  Level's entire dormant remembered selection; and
- an unrelated remembered selection is unchanged.

The Legacy environment pixels and all gameplay-authoritative board content are
unchanged. Switching to Legacy by itself still preserves the remembered AI
selection under ADR-0165; only this explicit archive intent forgets it.

Published slot output remains non-archivable. Archive remains a retained-history
operation: it hides the creation slot from the active workspace but does not
delete or mutate its immutable versions, Blob bytes, lineage, or audit events,
and it does not reclaim the ADR-0159 quotas.

### Detach and archive are one fenced transaction

The server locks and revalidates the current editor writer session, edit
generation, expected working-document revision, slot revision, working Level,
saved canonical Level, and affected lineage in one transaction. Both Levels are
decoded inside one freshly loaded database-owned render-catalog snapshot; a
missing or stale renderer catalog fails closed instead of being interpreted as
an empty selection. It removes
every allowed dormant Legacy reference and archives the slot atomically. A
stale fence, revision conflict, active AI reference, published output, or any
other failure changes neither the Levels nor the slot.

Changing the working Level advances its document revision, records the normal
retained working-copy checkpoint, and updates the active session. Changing the
canonical Level advances its owning workspace revision through the same
transaction. The response returns the authoritative updated editor document,
canonical Level, and workspace revision, plus explicit forgotten-selection
metadata. The mounted editor adopts that response before it can autosave again;
it never reconstructs the mutation locally or writes the stale selection back.
An idempotent retry likewise returns the current canonical Level and current
workspace revision, so losing the first response cannot leave the client's
whole-workspace compare-and-swap token behind.
Every archived replay returns that current canonical workspace revision even
when only the working copy needed repair. It also re-ensures the canonical
thumbnail derivative, so a derivative failure or lost response after the
durable detach is recoverable on the same idempotent action.

An idempotent retry also completes a selection detach left behind by an older
server that archived the slot without recognizing a database-catalog-dependent
board. That repair uses the same writer and document fences, records the
forgotten selection, and does not increment the already-archived slot revision
a second time.

### The control explains its state

When only a dormant Legacy selection is keeping the slot referenced, the
existing button is enabled for the writer and its confirmation states that the
remembered AI selection will be forgotten while the visible Legacy board will
not change. When archive is blocked, the control exposes the concrete reason,
including an active working or saved AI use, published output, missing write
authority, or an in-progress request. A disabled unexplained control is not an
acceptable representation of this state. The control also waits for any pending
cloud autosave so the document revision it submits is the latest acknowledged
server revision.

## Consequences

- An owner can retire an unwanted slot while remaining in Legacy mode without a
  preparatory Set, Save, or second detach action.
- A working or saved Level that actually renders the slot's art remains
  protected.
- The explicit archive action may update both working and canonical Level
  persistence even though the visible Legacy image does not change.
- Archived slots and their immutable art remain retained, attributable, and
  quota-counting.
- The client must treat the archive response as new server authority; merely
  refreshing the slot list is insufficient.

## Verification

Contract-complete implementation proves that:

- working and canonical Legacy Levels can forget matching dormant selections
  and archive the slot in one successful transaction;
- a matching AI selection in either working or canonical content rejects the
  whole operation without partial changes;
- unrelated remembered selections are preserved;
- published output, stale document revision, stale slot revision, and stale
  editor fence each reject atomically;
- retries are idempotent and retained versions and bytes remain resolvable;
- an already-archived slot with a dormant matching selection is healed without
  a second slot revision;
- a working-only repair and a no-op replay return the current canonical
  workspace revision, and a replay retries failed thumbnail preparation;
- catalog-dependent boards are decoded inside the authoritative snapshot and
  never mistaken for empty selections;
- the client adopts returned working and canonical state without a stale
  autosave; and
- the existing control is enabled for the writable, cloud-synced Legacy case
  and explains both its confirmation and every disabled state.
