---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
  - "[ADR-0152](0152-level-editor-session-attention-lives-in-title-bar-and-status.md)"
  - "[ADR-0153](0153-bulk-recovery-cleanup-is-snapshot-exact-and-atomic.md)"
  - "[ADR-0154](0154-level-editor-viewing-does-not-acquire-the-writer-lease.md)"
  - "[ADR-0157](0157-recovery-snapshots-browse-one-at-a-time-and-clear-atomically.md)"
  - "[ADR-0177](0177-level-editor-recovery-is-a-separate-side-control-destination.md)"
partially_supersedes:
  - "[ADR-0139](0139-persistence-failures-interrupt-editing-and-recovery-conflicts-resolve.md)'s browser-recovery conflict workflow"
refines:
  - "[ADR-0140](0140-working-copy-revisions-are-retained-and-owner-restorable.md)"
  - "[ADR-0160](0160-automated-editor-verification-is-observation-only.md)"
---

# ADR-0304: Level Editor documents are live shared working copies

## Context

The prior Level Editor treated each owner tab as a prospective branch. A
PostgreSQL lease selected one writer, other tabs followed read-only, and users
had to choose **Start editing here** or **Take over editing**. Displacement and
lease expiry manufactured durable recovery snapshots that accumulated until
the owner explicitly deleted them.

That model exposed internal concurrency control as the primary product
experience. Closing a page could leave a later page blocked by stale presence,
ordinary use repeatedly produced “recoveries,” and retained history occupied a
large default surface. These behaviors conflict with the established shared
document expectation: one document stays editable in every owner view and
changes made elsewhere appear without a takeover ritual.

## Decision

Each editor document has exactly one durable unpublished working copy for its
owner. Every ordinary authenticated owner page targets that same copy.

- An owner page session is an opaque authenticated write credential and an
  attribution record. Its historical active, waiting, displaced, or expired
  presence state does not grant or revoke mutation authority.
- Administrator access through an exact opaque document URL remains
  observation-only and cannot mutate, Save, Discard, restore history, or list
  another owner's documents.
- Owner pages poll the acknowledged document at a short bounded interval.
  Remote revisions are mounted immediately when the page has no pending local
  change. When it does, local and remote changes are merged and the result
  continues through ordinary autosave.
- Autosave sends the last acknowledged revision, the Level at that revision,
  and the current Level. The backend serializes writes under the document row
  lock and performs the canonical structural three-way merge when the submitted
  revision is stale. Independent fields and board entities survive together;
  for the same scalar field, the later server arrival wins.
- Board merges run through the canonical editor-board projection so boardCode
  and gameplay layers cannot diverge.
- Presence heartbeat is informational only. Page close, process loss, stale
  heartbeat, or lease expiry never creates a recovery branch and never blocks a
  valid owner page from editing.
- **Start editing here**, **Take over editing**, **Follow latest**, lease-holder
  warnings, displaced-branch uploads, and server-recovery cleanup are retired
  from the owner experience.
- Browser storage remains a bounded crash/offline retry buffer for the same
  working copy. It is not a routine parallel document or a permanent
  owner-managed recovery branch.
- Every acknowledged mutation still creates a retained private working-copy
  revision. History is a secondary opt-in surface: collapsed by default and
  fetched only when expanded. Restoring history creates a new private working
  revision and never publishes.
- **Save** remains the explicit promotion boundary to canonical content, and
  **Discard changes** remains the explicit reset to the current canonical
  Level.

This is shared editing with automatic structural convergence, not character-
level collaborative cursors. The visible contract is nevertheless the normal
shared-document contract: all current owner views edit one copy and converge
without branches or authority prompts.

## Consequences

- Opening a second tab resumes the same editable document immediately.
- An edit acknowledged in one tab becomes visible in other open tabs without
  reload or manual follow/takeover.
- Closing tabs during normal use does not leave recovery records to clean up.
- Stale client snapshots preserve independent concurrent work instead of
  overwriting the document or pausing behind an authority conflict.
- Same-field simultaneous edits have a deterministic last-arrival result; this
  implementation does not expose cursors, selections, or per-keystroke OT/CRDT
  semantics.
- Existing recovery rows and legacy lease columns are inert historical storage
  until a separately coordinated schema migration can remove them from the
  shared database. No runtime path creates or presents new server recoveries.

## More Information

- [Persistence contract](../persistence.md)
- [Level Editor implementation](../../frontend/src/ui/LevelEditor.tsx)
- [Canonical shared merge](../../packages/board-render/src/core/sharedLevelMerge.ts)
