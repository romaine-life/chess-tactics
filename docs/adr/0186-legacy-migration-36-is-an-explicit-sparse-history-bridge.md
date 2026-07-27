---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
partially_supersedes:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
---

# ADR-0186: Legacy migration 36 is an explicit sparse-history bridge

## Context

ADR-0174 correctly made migration identities immutable and required the source
registry to be contiguous. Its upgrade-path description incorrectly assumed
that every deployed numeric-only database had recorded migrations 1 through 36.

The accepted `origin/main` registry actually contained migrations 1 through 27
and migration 36. Versions 28 through 35 were added later while building the
append-only migration system. A production-shaped history therefore contains
numeric-only rows 1–27 and 36, with 28–35 absent. Treating every recorded row
after a missing version as corruption prevents the migration runner from
applying the very migrations that make this history contiguous and
checksummed. A smoke fixture that pre-records 28–35 hides that failure instead
of testing the deployed upgrade.

## Decision

### One historical sparse row is recognized explicitly

Before migration identity columns exist, runtime planning may recognize only
migration 36 as the known sparse legacy row. The exception applies only when
that row is numeric-only: both its recorded name and checksum are absent.
Migration 36 is then skipped as already applied while missing migrations 28–35
remain pending.

No generic gap tolerance exists. Any other recorded version after a missing
earlier migration fails immutable-history validation. Migration 36 also fails
that validation if it has a recorded name, checksum, partial identity, or
identity that differs from source.

The exception remains available while an interrupted upgrade resumes, because
some of migrations 28–35 may already have committed while migration 36 is
still the numeric-only sparse row. It is supplied only by the server's
pre-sealing plan; ordinary checks and the post-sealing plan remain strict.

### The real sparse baseline is the upgrade fixture

Upgrade-path QA begins from the exact former ledger: the immutable SQL for
migrations 1–27 and 36 is executed and only those numeric version rows are
recorded. Auto migration must:

1. skip 1–27 and 36;
2. apply missing migrations 28–35;
3. apply migration 37, which adds identity storage and seals the now-complete
   1–36 history against source;
4. apply every later migration in order; and
5. pass a second strict check-mode startup with no pending work.

The fixture must not insert rows for migrations that were absent from the
deployed history.

This partially supersedes ADR-0174 only where it describes the former history
as a contiguous numeric-only 1–36 prefix and requires runtime to reject every
non-prefix history before the one-time bridge can run. ADR-0174's source
contiguity, immutable identity, sealing, explicit execution, readiness, and
reporting decisions remain in force.

## Consequences

- Existing databases can advance from the migration ledger that actually
  shipped.
- A narrowly identified historical fact does not weaken normal migration
  integrity.
- Interrupted upgrades can resume safely.
- CI and smoke tests fail if future code again assumes a fabricated contiguous
  legacy ledger.

## Verification

Contract-complete verification proves that:

- the numeric-only `1–27,36` history plans 28–35 and every migration after 36;
- numeric-only migration 36 may be the sole out-of-order row during the
  pre-sealing plan;
- the same gap is rejected when 36 has full or partial identity metadata;
- every other out-of-order version remains rejected;
- migration 37 seals all rows 1–36 after the gap is filled;
- the upgraded database satisfies current relation and constraint
  postconditions; and
- a subsequent check-mode process reports no applied or pending migration.
