---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes: "[ADR-0429](0429-level-format-versions-always-migrate.md)"
refines:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
  - "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
---

# ADR-0430: Pruned saved revisions retain baseline evidence

## Context

Migration 61 reconstructed an erased Level working-copy `baseline_hash` from the exact retained
`saved_revision`, or from the current body when the working copy itself was still at that revision.
Production then exposed four older saved documents whose retention history began after their saved
revision. Each document still had later retained revisions carrying the same `saved_revision` and
the non-null baseline hash recorded before migration 56, but migration 61 deliberately left them
unrepaired because it did not consult that second source of evidence. The resulting required-schema
postcondition kept the new deployment out of readiness.

The baseline cannot be replaced with the current canonical hash: doing that would assert an
unproved relationship and could allow Save to overwrite a canonical Level which changed after the
working copy's last Save. The retained hash may identify the old Level-format representation, so it
also must not be described as proof that the current format-2 canonical Level is unchanged.

## Decision

- Baseline reconstruction uses an evidence hierarchy. Migration 61 remains the immutable exact-body
  repair. Append-only migration 62 repairs a still-null saved baseline only from the newest retained
  revision whose `saved_revision` equals the working copy's current positive `saved_revision` and
  whose `baseline_hash` is non-null.
- Migration 62 copies that recorded hash verbatim. It does not change the working Level,
  `saved_revision`, or canonical workspace. It advances the working-copy revision and records the
  ordinary `migration` history checkpoint in the same transaction.
- A recovered pre-format-2 hash is expected to differ from the current canonical format-2 hash.
  That conservative mismatch remains `baseline_conflict: true`, blocks Save, and makes explicit
  fenced Discard the path which adopts the current canonical Level without losing the private draft
  silently.
- If neither the exact saved body nor a retained matching baseline hash exists, readiness continues
  to fail closed. No synthetic hash and no current-canonical substitution may manufacture evidence.
- Required-contract auto-repair routes Level-1 or embedded Run-22 drift to migration 61, then routes
  any remaining saved-baseline gap to migration 62. Both migrations are idempotent and remain
  independently checksummed.
- Upgrade and operation-level coverage must prove the missing-saved-revision case, historical-hash
  restoration, conflict preservation, repeat execution, and real fenced Discard to the current
  canonical Level.

## Consequences

- Retention may prune the body of a saved revision without erasing the later checkpoints that prove
  its baseline identity.
- The rollout can repair legacy documents without editing migration 61, changing canonical content,
  or pretending that an old-format hash matches the new-format representation.
- Documents lacking either accepted evidence source remain unavailable instead of becoming unsafe
  to Save.

## More Information

- [ADR-0429](0429-level-format-versions-always-migrate.md)
- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
