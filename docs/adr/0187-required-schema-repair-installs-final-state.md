---
status: accepted
date: 2026-07-26
deciders: Nelson, Codex
refines:
  - "[ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)"
---

# ADR-0187: Required schema repair installs final state

## Context

Append-only migrations preserve every historical transition, including checks
that were valid only before later features existed. That makes the historical
sequence authoritative for a normal upgrade, but not automatically safe as a
current-state repair program.

Generation-attempt relation repair replayed migrations 31 through 41. Migration
34 intentionally rejects any pre-existing `pipeline-source` attempt, and
migration 39 temporarily narrows the attempt-event action set before migration
40 admits `move-highlight-profile-updated`. Replaying either transition on a
current database can therefore reject rows that satisfy the final schema. A
missing relation or drifted retry constraint would remain unrepaired even
though the retained rows were valid.

## Decision

Required-schema repair for generation attempts uses append-only migration 43,
`repair generation attempt schema from final state`.

Migration 43 is an idempotent declaration of the complete current
`predrawn_generation_attempts` and
`predrawn_generation_attempt_events` topology. It:

- creates either relation when absent;
- adds every current nullable authoring column and the non-null processing
  revision;
- replaces only the affected origin, input, retry, move-highlight, and action
  constraints with their final definitions;
- accepts already-valid reusable `pipeline-source` rows;
- accepts existing `move-highlight-profile-updated` audit events; and
- restores the final composite foreign keys and indexes.

Normal migration execution still applies every pending historical migration in
order. Applied migrations 31 through 42 remain immutable. Migration 43 is both
the next normal append-only migration and the sole repair source for missing
generation-attempt relations or drifted retry/move-highlight contracts.
Readiness does not replay transitional migrations for those repairs.

The disposable PostgreSQL smoke suite must exercise migration 43 with a
pre-existing pipeline-source attempt and with a pre-existing
move-highlight-profile-updated event. Static source inspection alone is not
proof that final-state repair accepts retained data.

## Consequences

- Current valid rows cannot be made invalid temporarily by schema repair.
- Relation and constraint repair converge through one named, checksummed
  migration and produce an attributable migration report.
- Future changes to generation-attempt topology append another final-state
  repair migration and redirect the repair registry; migration 43 remains
  immutable.
- A migration may be replay-safe for normal upgrade but unsuitable for repair.
  Repair mappings require their own retained-data regression scenario.

## More Information

- [ADR-0174](0174-database-migrations-are-append-only-checksummed-and-explicit.md)
- [Persistence contract](../persistence.md)
