---
status: accepted
date: 2026-07-20
deciders: Nelson, Codex
refines: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
---

# ADR-0146: Recovery snapshots browse one at a time and clear atomically

## Context

The Level Editor keeps displaced and uploaded recovery snapshots until the
owner explicitly removes them. Presenting every snapshot and its Restore and
Delete actions at once turns this safety feature into an ever-growing wall of
destructive controls. Removing that clutter must not make cleanup broad or
ambiguous enough to erase a recovery created after the owner reviewed the
confirmation.

## Decision

The Status recovery surface is one bounded browser, not a stacked list. It
shows exactly one recovery card at a time in newest-first order, identifies the
current position as **Recovery _n_ of _total_**, and provides labeled Previous
and Next controls. Navigation stops at the ends. Refresh preserves the selected
recovery by id when it still exists and otherwise selects the nearest remaining
newer-first position.

The current card retains its individual Restore and Delete actions. The surface
also provides one distinct **Delete all recovery copies** action for the server
recovery snapshots that were listed when the owner invoked it. Its confirmation
must state the exact number of snapshots, name recovery snapshots as the only
data being removed, state that the operation cannot be undone, and default to
the safe choice: Cancel receives initial focus, Escape cancels, and no timeout,
navigation, or implicit default may confirm it.

Bulk cleanup is one owner-only, database-atomic operation over the exact
recovery ids in that confirmation snapshot. After confirmation, the server
transaction revalidates the current writer session credential and fencing epoch
and verifies that every submitted recovery still belongs to that owner and
document. If the fence is stale, any submitted recovery is unavailable, or the
set cannot be deleted in full, it deletes none. A recovery created after the
confirmation snapshot is not in the submitted set and is therefore preserved.
The client does not approximate this contract with a sequence of individual
Delete requests.

Deleting server recoveries, individually or in bulk, has no effect on the live
working copy, canonical saved Level, retained working-copy revision history,
editor lease, or session-scoped browser backup. It does not Save, Discard,
restore, publish, or delete the editor document. The UI reports success only
from the server's atomic acknowledgement and then reloads the authoritative
recovery collection.

## Required verification

- More than one recovery renders as one card with an accurate position label;
  Previous and Next cannot move beyond the newest and oldest entries.
- Confirming bulk cleanup deletes exactly the ids shown at confirmation in one
  transaction, while a recovery created afterward remains reachable.
- A stale fence, wrong-document id, missing submitted recovery, or interrupted
  transaction deletes no recoveries.
- Cancel, Escape, and closing the confirmation perform no mutation, with Cancel
  as the initially focused action.
- Bulk cleanup leaves the working copy, canonical Level, retained revision
  history, editor authority, and browser backup byte-for-byte unchanged.

## Consequences

- A long-lived document has a compact, understandable recovery surface instead
  of repeated destructive controls consuming the Status panel.
- Owners can deliberately clear accumulated server recoveries with one action
  whose scope is precise and race-safe.
- Cleanup requires a dedicated bulk endpoint and transaction rather than a
  client-side loop over the single-delete endpoint.
- Newly arriving recoveries survive a cleanup confirmation that did not show
  them.

## Rejected alternatives

- **Render every recovery card:** preserves access but makes the safety surface
  harder to scan as snapshots accumulate.
- **Client-side repeated deletes:** can leave a partially cleaned collection and
  cannot make the confirmation's scope atomic.
- **Server-side “delete everything now”:** can erase a later recovery the owner
  never saw or agreed to remove.
- **Cleanup without the current writer fence:** lets a displaced or expired tab
  remove recovery data after authority moved elsewhere.

## More Information

- [Persistence: Level editor working copies and sessions](../persistence.md#level-editor-working-copies-and-sessions)
- [ADR-0143: Level Editor sessions are attributable, single-writer, and owner-takeoverable](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)
- [ADR-0140: Working-copy revisions are retained and owner-restorable](0140-working-copy-revisions-are-retained-and-owner-restorable.md)
