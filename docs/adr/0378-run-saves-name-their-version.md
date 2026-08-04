---
status: superseded by ADR-0379
date: 2026-08-03
deciders: owner (Nelson) + Codex
superseded_by: "[ADR-0379](0379-lossless-run-save-changes-migrate.md)"
refines:
  - "[ADR-0376](0376-held-relics-are-lipsana.md)"
  - "[ADR-0377](0377-a-won-battle-is-reported-on-its-own-screen.md)"
---

# ADR-0378: Run saves name their version

## Context

The persisted Run document called its schema marker `formatVersion`, its constant
`RUN_FORMAT_VERSION`, and the surrounding discussion shortened that further to phrases such as
“format 15.” The number then sounded like an unexplained game concept instead of the version of
an in-progress Run save. The generic name also hid a real boundary error: RunSaveVersion 16 was
current, but the client still accepted some version-15 saves through an older minimum-version
check even though ADR-0377 made every in-progress older Run unsupported.

## Decision

- The concept is **RunSaveVersion**: the version of the persisted in-progress Run document.
- `RunDocument.formatVersion` becomes `runSaveVersion`, its type is `RunSaveVersion`, and the
  shared current value is `CURRENT_RUN_SAVE_VERSION`.
- The field rename creates RunSaveVersion 17. Existing in-progress Runs are unsupported; neither
  browser nor account persistence reads `formatVersion` or an earlier `runSaveVersion`.
- `normalizeRunDocument` accepts exactly `CURRENT_RUN_SAVE_VERSION`. It may repair incomplete
  state inside that current save shape, but it does not upgrade or re-stamp an older version.
- The backend validator reads the shared current value and validates only that shape. Historical
  per-version conditions and compatibility reads are deleted.

## Consequences

- A person can say “Run save version 17” and the number names what it versions.
- Every future Run save change has one explicit acceptance boundary shared by client and server.
- No database migration rewrites `active_runs`. A new Run replaces the unsupported row through
  the existing active-Run workflow.

## More Information

- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
