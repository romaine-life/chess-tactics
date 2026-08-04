---
status: superseded by ADR-0380
date: 2026-08-03
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0380](0380-run-save-versions-always-migrate.md)"
supersedes:
  - "[ADR-0378](0378-run-saves-name-their-version.md)"
refines:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
  - "[Migration policy](../migration-policy.md)"
---

# ADR-0379: Lossless Run save changes migrate

## Context

ADR-0378 correctly named RunSaveVersion and closed an accidental version-15 acceptance floor,
but treated the `formatVersion` to `runSaveVersion` field rename as a reason to discard every
version-16 in-progress Run. That confused a schema boundary with data disposal. The transform is
total and lossless: remove one key, write the same integer under its new key, and leave every
gameplay field unchanged.

Account Runs already live in PostgreSQL behind append-only migrations and CAS revisions. Anonymous
Runs live in browser storage, where the client is the only process capable of migrating them.
Neither storage location requires dual-format gameplay code.

## Decision

- A RunSaveVersion change that has a total deterministic transform migrates in-progress Runs. Data
  is discarded only when no honest transform can preserve its meaning.
- Migration 54 rewrites account Run version 16 from `formatVersion` to `runSaveVersion`, sets the
  value to 17, and advances the row's CAS revision. It does not change gameplay state.
- Browser storage performs the same exact 16-to-17 transform when it first reads the saved Run and
  immediately overwrites the stored value with the version-17 document.
- `normalizeRunDocument` and the backend validator still accept only the current shape. Migration
  is an explicit boundary step, not scattered version conditions or permanent dual-format logic.
- Saves older than version 16 remain unsupported. This decision does not invent transformations
  for the incompatible vocabulary and aftermath changes retired by ADR-0376 and ADR-0377.
- Future RunSaveVersion changes must state whether they are losslessly migratable. A migratable
  change ships its account and browser transformations with upgrade-path coverage; an incompatible
  change records why the old state cannot be represented truthfully before requiring a restart.

## Consequences

- Deploying the RunSaveVersion name does not erase an in-progress version-16 Run.
- Every migratable version-16 account Run stores only `runSaveVersion` after migration 54, and
  browser storage is rewritten to the same shape on first load. The retired field does not survive
  as an alternate current format.
- The repository migration policy still prohibits keeping retired systems or behavior alive. A
  bounded data rewrite that deletes the old representation is a migration, not compatibility.

## More Information

- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
