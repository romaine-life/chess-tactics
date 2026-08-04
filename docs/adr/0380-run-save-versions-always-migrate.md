---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0379](0379-lossless-run-save-changes-migrate.md)"
refines:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
  - "[Migration policy](../migration-policy.md)"
---

# ADR-0380: Run save versions always migrate

## Context

ADR-0379 corrected the immediate version-16 field rename, but still described migration as
conditional on an old Run having an obvious lossless representation. That leaves ordinary
active-development changes vulnerable to becoming excuses for deleting player progress.

Live games solve this with explicit save migrations. Removed content is data too: if a card no
longer exists, the migrated deck can carry a typed **Removed card** entry. The entry preserves the
fact that a slot was acquired without pretending the retired rules still execute. This is simpler
and more honest than invalidating the whole Run.

## Decision

- Every RunSaveVersion that reaches players has an explicit forward migration to the next version.
  Deploying a new version without both account and browser-save migration paths is incomplete.
- Account documents migrate through append-only database migrations. Browser-owned documents run
  the same versioned transformation at their storage boundary and immediately persist the current
  shape.
- Content removal maps stored references to a typed tombstone or neutral replacement. For example,
  a removed card becomes **Removed card** in the deck; it is not silently dropped and does not make
  the Run unsupported.
- A migration preserves all still-meaningful state and records deliberate substitutions explicitly.
  Runtime gameplay and validation continue to consume only the current shape.
- Rejection is reserved for corrupt data, unknown version markers, or data outside the declared
  production migration history. It is not the normal outcome of a RunSaveVersion bump.
- Migration 54 and the browser version-16 transform remain the first migration under this rule.
  Versions already retired before this policy are not reconstructed without a separately specified
  source contract.

## Consequences

- A normal deployment does not erase an in-progress player Run.
- Removing or renaming gameplay content includes its save-data mapping as ordinary feature work.
- Tombstones remain distinguishable from active content, so migrations preserve history without
  reviving retired behavior.
- Nelson's own active Run remains disposable review state; that operational permission does not
  weaken the migration requirements for player data.

## More Information

- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
