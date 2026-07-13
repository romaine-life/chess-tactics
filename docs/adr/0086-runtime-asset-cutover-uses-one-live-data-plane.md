---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0085
---

# ADR-0086: Runtime asset cutover uses the one live app data plane

## Context

ADR-0085 correctly moved media ownership from Git to Postgres pointers plus
private immutable Blob bytes. Its first cutover runbook made an isolated,
production-seeded test database and test-slot deployment a release gate.

That gate does not match the application's current operating model. There are
no users to protect through a standing dev/production data split. The Postgres
database and object store are simply the live data plane backing the app, and
normal asset iteration must exercise that authority rather than a copy of it.
Creating another catalog solely to resemble a mature production topology adds
an environment to operate without changing who owns the real pointers.

CI already uses transient synthetic Postgres instances for destructive backend
tests. Those are test-process implementation details, not another content
environment and not an asset-promotion authority.

## Decision

The existing app Postgres database and private media container are the one
authoritative runtime-asset data plane. The cutover does not create, seed, or
require a second owner-facing asset database.

The migration is exercised against that data plane through an unserved,
short-lived bootstrap pod running the candidate application image. The pod has
no Service, route, or ingress. It applies the additive schema migration, imports
the frozen inventory, and proves every immutable byte and semantic pointer over
a local port-forward. Git media remains present until this proof succeeds.

The final no-Git candidate image is then run in the same unserved manner against
the same database and Blob container. The owner verifies that exact application
image over the port-forward before it is merged and rolled out to the normal
Service. This is deployment sequencing within one data environment, not a
dev/production data split.

Automated tests may continue to create transient databases containing only
synthetic fixtures when a test intentionally mutates or clears its database.
Such a database cannot accept owner edits, become a review/promotion surface, or
serve as cutover evidence. Optional preview tooling may project public,
immutable reads for rendering diagnostics, but it is not a required release
gate and cannot write or promote live content.

Schema changes against the live database must remain additive or transactional
during this zero-user phase. Before a destructive migration becomes necessary,
the operator must take a recoverable backup; the need for destructive rehearsal
or real user isolation is the trigger to introduce another environment later.

## Consequences

- Asset editing and verification exercise the same backend authority the app
  actually uses.
- The project does not acquire a standing dev/production content split before
  there is a user, availability, or destructive-migration reason for one.
- Cutover safety comes from frozen hashes, immutable Blob versions, reversible
  pointers, database backup, unserved candidate pods, and owner verification.
- CI's transient Postgres remains useful without being mistaken for an
  alternate content store.

## Scope of supersession

This supersedes only ADR-0085's implication that a production-seeded test-slot
database is a mandatory runtime-asset cutover and owner-verification gate. Its
live-storage ownership, semantic-slot, acceptance, delivery, and deletion-
complete migration decisions stand unchanged.
