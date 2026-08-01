---
status: superseded by ADR-0304
date: 2026-07-25
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0152](0152-level-editor-session-attention-lives-in-title-bar-and-status.md)'s placement of recovery details in Status and its single Status destination for title-bar attention"
  - "[ADR-0153](0153-bulk-recovery-cleanup-is-snapshot-exact-and-atomic.md)'s placement of bulk recovery cleanup in Status"
  - "[ADR-0157](0157-recovery-snapshots-browse-one-at-a-time-and-clear-atomically.md)'s placement of the recovery browser in Status"
refines: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
superseded_by: "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
---

# ADR-0177: Level Editor Recovery is a separate side-control destination

## Context and Problem Statement

Status accumulated editing-session attribution, save readiness, validation,
autosave health, browser recovery decisions, server recovery snapshots,
working-copy history, exports, and destructive cleanup. The individual
recovery controls were bounded, but their combined presence overran the normal
save/status workflow and made Status harder to understand.

Recovery is a distinct owner task. It needs a reachable home without becoming
a modal, a center workspace, or an always-visible interruption.

## Decision Outcome

The Level Editor has a canonical **Recovery** side-control destination at
`layer=recovery`.

Recovery owns:

- preserved browser and Test/route snapshot decisions;
- exact browser-recovery and cloud-working-copy downloads;
- the attributed server recovery browser, Restore, per-copy Delete, and
  snapshot-exact **Delete all recovery copies**;
- retained working-copy history and its private Restore action; and
- explicit empty states when no recovery needs attention.

Status retains:

- editing-session attribution, Follow latest, Start editing, and Take over;
- level identity and campaign assignment;
- playability and save-readiness failures;
- autosave health and retry;
- Discard, Save, and Publish;
- material totals; and
- the status log.

Recovery is a normal right-rail layer, not a board brush or center workspace.
It is non-painting, URL-addressable, available on legacy and pre-drawn levels,
and uses the existing single rail scroll boundary.

The global persistence-interruption banner remains outside both layers.
Session-authority attention opens and focuses Status. Recovery attention opens
and focuses Recovery. Ordinary healthy state remains silent outside those
destinations.

This separation changes only information architecture. Session attribution,
writer fencing, compare-and-swap recovery, revision restoration, exact-set
atomic cleanup, safe confirmation defaults, and the rule that no recovery
action implicitly Saves or Publishes remain unchanged.

## Consequences

- Status again describes the current level and whether it can be saved.
- Recovery operations are discoverable without competing with ordinary save
  controls.
- Recovery safeguards remain visible during recovery work and globally
  interrupt authoring only when an unresolved persistence failure requires it.
- Direct URLs and title-bar attention can take the owner to the exact concern.

## Verification

- `layer=status` contains session, validation, autosave, Discard, Save/Publish,
  material, and log controls but no recovery browser, recovery exports, or
  revision history.
- `layer=recovery` contains browser/cloud copies, the bounded server recovery
  browser, and working-copy history, including clear empty states.
- Session attention opens Status; recovery attention opens Recovery.
- Recovery remains reachable for a pre-drawn level and cannot arm a paint
  tool.
- The persistence interruption and its emergency exports remain reachable
  outside either selected layer.
- Restore and deletion retain all existing server fencing, confirmation, and
  atomicity tests.
