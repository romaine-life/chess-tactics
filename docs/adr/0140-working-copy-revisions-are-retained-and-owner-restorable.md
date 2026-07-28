---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
---

# ADR-0140: Working-copy revisions are retained and owner-restorable

## Context

The Level Editor's compare-and-swap working copy protected newer server data, but the server kept
only its latest body. A browser recovery conflict could therefore require forensic extraction from
Chrome storage even though both sides had previously been valid editor states. The UI also offered
no direct export of either copy.

## Decision

- Every acknowledged working-copy mutation records the resulting complete Level in
  `level_working_copy_revisions` inside the same database transaction as the current-row update.
  The latest `level_working_copies` row remains the one CAS authority.
- Retention keeps the newest 200 revisions, the newest checkpoint from every UTC day, and every
  explicit create/resolve, Save, Discard, Restore, migration, or canonical-refresh boundary.
- The owner may list body-free revision summaries and restore one retained body. Restore requires
  the current observed revision and writes the historical body as a new revision; it never rewinds
  the CAS counter, Save state, campaign assignment, or canonical workspace.
- Revision discovery and restore remain owner-only. ADR-0132's direct-link administrator exception
  continues to expose only the current document and does not grant history access or mutation.
- The Level Editor exposes **Download browser copy** and **Download cloud copy** wherever
  persistence is interrupted and in the Status controls. These exports are side-effect free and
  do not Save or publish.
- Before a UI restore, any edit still in the autosave debounce window is written as its own cloud
  revision. An unresolved browser/cloud or baseline conflict blocks restore until the owner chooses
  a side, so history cannot erase the only copy of an unacknowledged edit.
- Cloud equality is measured through the same Level-to-editor projection that produces the editable
  candidate. Loading a stored Level whose serialized form is not already normalized must not count
  as an edit, dirty the working copy, or create an autosave revision.

## Consequences

- Recovery is an ordinary product operation instead of a dependency on browser database access.
- A restored version remains undoable because the version it replaced is itself retained.
- Recent editing has granular history while long-lived documents retain bounded daily and explicit
  lifecycle checkpoints.
- History storage grows predictably without weakening the canonical Save boundary.
- Opening or returning to an untouched document is read-only even when its stored board encoding is
  a valid non-normalized representation.

## More Information

- [Persistence](../persistence.md#level-editor-working-copies)
- [ADR-0139](0139-persistence-failures-interrupt-editing-and-recovery-conflicts-resolve.md)
- [ADR-0132](0132-admins-may-direct-read-editor-documents.md)
