---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
  - "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
  - "[ADR-0380](0380-run-save-versions-always-migrate.md)"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)"
  - "[Migration policy](../migration-policy.md)"
---

# ADR-0429: Level format versions always migrate

## Context

Level `formatVersion` remained at 1 while database migration 56 changed the meaning and shape of
that version in place. It removed Pawn-only deployment zones from canonical Levels, editor working
copies, their retained revisions, encoded `boardCode`, and other nested Level locations. The
migration then set every changed working copy's `baseline_hash` to null.

That produced two independent failures. There was no explicit document-version edge by which an
older exported, browser-owned, or embedded Level could reach current code. And a working copy that
had already crossed Save became indistinguishable in the UI from a never-saved draft even though
its `saved_revision` and saved revision body still proved the earlier boundary. The affected
document could report a canonical conflict while hiding **Discard changes**, its only valid
recovery action.

Database migration numbering establishes the ordered PostgreSQL rollout ledger. It does not by
itself version every JSON document stored inside those tables. Durable JSON formats require their
own markers, transforms, storage-location inventory, and operation-level verification.

## Decision

- Every Level format version that reaches durable or exported data has one explicit forward
  migration to the next version. Current editor, gameplay, renderer, and backend validators accept
  only the exact current shape.
- Level format version 2 owns the complete retirement of `player-pawn-spawn`. The version 1 to 2
  transform folds its squares into the first general `player-spawn` zone, removes Pawn from that
  zone's exclusions, rewrites both structured layers and `boardCode`, and preserves unrelated
  Level data.
- One shared DOM-free `migrateLevelDocument` is the canonical client/package transform. Imports and
  other client-owned Level boundaries advance old documents there and immediately retain only the
  current shape. Unknown markers and structurally invalid results fail closed.
- Migration 61 applies the same version edge to every PostgreSQL location known to contain a Level:
  canonical Levels and workspaces, official and public snapshots, working copies and retained
  revision/session/recovery bodies, embedded Run Battles, and lab/train/solve documents.
- Since a Run snapshot embeds complete Levels, the same rollout advances RunSaveVersion 22 to 23.
  Account storage uses migration 61; browser storage uses the declared Run migration chain.
- A Level working-copy migration preserves its edit state. It advances `saved_revision` only when
  the working copy was clean. For every document with `saved_revision > 0`, it reconstructs the
  migrated `baseline_hash` from that exact retained saved revision (or the current body when it is
  the saved revision). A true never-saved document keeps `saved_revision = 0` and a null baseline.
- `baseline_conflict` is itself proof that a canonical Discard target exists. The editor therefore
  exposes **Discard changes** for a conflict even if historical bad metadata left
  `has_saved_baseline` false.
- `never_saved` is derived from `saved_revision = 0`, not from baseline-hash presence. A missing
  hash cannot reclassify an already-saved document as a disposable draft.
- Upgrade coverage must prove every registered Level location contains only version 2, baseline
  reconstruction preserves clean and dirty documents, repeated execution is idempotent, and a
  repaired editor document can perform its real fenced Discard operation.

## Consequences

- `formatVersion` once again identifies one Level shape instead of a moving label.
- A database migration that changes Level data is incomplete until it also declares the Level
  version edge and covers all storage and import boundaries.
- The affected production working copy is repaired by the ordinary migration rollout; no row-level
  production edit or migration-ledger exception is required.
- The PostgreSQL schema-migration ledger and Level/Run document versions remain separate, explicit
  authorities: migration 61 may advance Level 1 to 2 and Run 22 to 23 in one transaction, but those
  numbers are not interchangeable.

## More Information

- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
