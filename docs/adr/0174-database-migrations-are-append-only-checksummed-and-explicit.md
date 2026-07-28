---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0186](0186-legacy-migration-36-is-an-explicit-sparse-history-bridge.md)"
refines:
  - "[ADR-0086](0086-runtime-asset-cutover-uses-one-live-data-plane.md)"
---

# ADR-0174: Database migrations are append-only, checksummed, and explicit

## Context

The migration table originally recorded only an integer version. That could not
distinguish the SQL which actually ran from different source code later assigned
the same number. Startup also reported that migrations were "applied" without
saying whether any migration ran, and readiness verified version rows and
relations without proving the database constraint responsible for an operation.

This failed during Board Art slot archiving. Migration 36 had already run as
**allow one drawable media slot to satisfy multiple roles**. Reusing 36 for a
working-copy revision reason caused the migration runner to skip the changed
contents, while a fresh-database test passed and the owner became the first
upgrade-path integration test.

## Decision

### Applied migration identity is immutable

The inline migration registry is an ordered, contiguous, append-only sequence.
Once a migration number may have been recorded, its number, name, and SQL never
change. A follow-up always receives the next number, even when it repairs the
immediately preceding migration.

Each identity is a SHA-256 digest of its version, name, and SQL after newline
normalization. CI compares the current registry with the pull request's base and
rejects any edited, renamed, removed, reordered, duplicated, or gapped
historical entry. Runtime planning likewise rejects a recorded checksum or name
which differs from source, an unexpected recorded version, partial identity
metadata, and non-prefix history. It does not reinterpret an old number as
pending work.

Migration 36 remains the drawable-media uniqueness change which actually ran.
Migration 37 introduces the migration-identity columns and the registered
working-copy revision-reason contract. Because rows 1–36 predate checksums,
applying 37 seals those numeric-only rows once against the pinned canonical
registry. Migration 38 then makes both identity columns non-null so the
temporary legacy bridge cannot bless a future numeric-only row. Every migration
applied afterward records its name and checksum in the same transaction as its
version.

### Schema readiness proves postconditions

Migration numbers are evidence of attempted history, not sufficient proof of a
usable schema. Readiness also validates required relations and semantic
postconditions.

For working-copy revision reasons, migration 37 replaces the duplicated inline
`CHECK` with a canonical reason catalog and one exact, validated foreign key.
Readiness inspects PostgreSQL constraint metadata and fails if the old
reason `CHECK` remains, the catalog is incomplete, the foreign key is absent or
unvalidated, its columns or target differ, or another reason foreign key
competes with it. Auto mode may replay the append-only idempotent repair while
holding the migration lock; check mode never mutates.

The same rule applies to future runtime-critical schema behavior: record a
queryable postcondition and validate the database state an endpoint actually
depends upon rather than treating the version ledger as that state.

### Migration execution is an explicit operation

Normal local application startup remains `SCHEMA_MIGRATIONS=check` and is
read-only. Advancing the shared development database uses only:

```sh
cd backend
npm run schema:migrate
```

This standalone command resolves the same development Postgres identity as the
Vite-launched backend when `DATABASE_URL` is absent, runs migration apply plus
required schema postconditions under the advisory lock, prints its result, and
exits without listening or seeding application content. Deployment and
disposable smoke environments opt into `auto` explicitly. The migration runner
plans from immutable history, executes each pending migration transactionally,
repairs and verifies required schema, seals eligible legacy history, and fails
closed if any invariant is unmet.

Migration output is derived from the completed plan. It lists the exact
version and name of every migration applied, every already-applied migration
skipped, and anything still pending. A mode label is not a success report.

### Upgrade-path and operation-level QA are required

A mutation is not proven by fresh-schema DDL tests or process health. Its
disposable integration test must invoke the real authenticated endpoint and
inspect the durable transaction result.

The migration-37/38 smoke fixture begins with canonical migrations 1–36 already
executed but recorded under the historical numeric-only format. The production
auto-mode backend must apply only 37 and 38, seal rows 1–36, enforce non-null
identity, report the exact plan, and then successfully execute the real
generation-attempt archive endpoint and record its
`generation-attempt-archive` working-copy revision. A second backend starts in
check mode against that same upgraded database and must report no applied or
pending migration.

## Consequences

- Reusing or editing an applied migration fails in CI and at runtime instead of
  silently becoming a no-op.
- Readiness catches the exact stale-constraint state that previously rejected
  archive, even if the expected migration number and catalog row exist.
- Startup output is usable operational evidence rather than a generic success
  phrase.
- Owners do not provide the first integration click for a new mutation.
- A migration change requires a new numbered entry plus upgrade-path and
  operation-level tests; this is deliberate overhead.
- Checksums cannot reconstruct SQL executed before checksums existed. The
  one-time seal therefore depends on the explicitly pinned canonical history;
  it must not be described as retrospective proof of unknown historical bytes.

## More Information

- [Persistence contract](../persistence.md)
- [ADR-0086](0086-runtime-asset-cutover-uses-one-live-data-plane.md)
- [ADR-0172](0172-archiving-a-board-art-slot-forgets-only-dormant-legacy-selection.md)
