---
status: "accepted"
date: 2026-07-25
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0177](0177-level-editor-recovery-is-a-separate-side-control-destination.md)"
refines: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
---

# ADR-0153: Bulk recovery cleanup is snapshot-exact and atomic

## Context and Problem Statement

Level Editor recovery snapshots remain available until the owner explicitly
deletes them. Per-copy deletion is necessary for selective cleanup, but makes
clearing an accumulated list repetitive. A broad "delete whatever exists now"
operation would be unsafe because it could erase a recovery created after the
owner reviewed the confirmation.

## Decision Outcome

- Status provides one **Delete all** action alongside the listed server
  recovery copies.
- Confirmation states the exact number of copies, the unaffected data, and
  that deletion cannot be undone. Destructive confirmations initially focus
  Cancel and do not treat Enter as approval.
- The client captures the recovery IDs shown when the action begins and sends
  those exact IDs in one request through the current writer fence.
- One database transaction revalidates the writer credential and fencing
  epoch, locks the submitted owner/document recovery rows, and deletes all
  submitted IDs or none.
- A missing, foreign, or already-removed submitted ID causes a snapshot
  conflict with no deletion. A recovery created after confirmation is not in
  the submitted set and survives.
- Cleanup does not alter the working copy, canonical saved Level, working-copy
  history, editor authority, or browser backup.

## Consequences

The owner can clear accumulated server recoveries deliberately without a
client-side delete loop or a race that widens the confirmed scope.
