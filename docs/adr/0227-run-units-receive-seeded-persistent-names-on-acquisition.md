---
status: superseded by ADR-0228
date: 2026-07-29
deciders: owner (Nelson) + Codex
superseded_by: ADR-0228
---

# ADR-0227: Run units receive seeded persistent names on acquisition

Superseded by
[ADR-0228](0228-run-unit-names-are-role-specific-historical-identities.md).

## Context

Run already gives every persistent army unit a durable identity, but player-facing
surfaces distinguish units only by chess-piece type. Repeated Pawns, Bishops, or
Knights therefore remain interchangeable even after surviving several Battles.
The owner wants randomly generated names now, with editing later when the unit
viewer is ready. The name supply must comfortably exceed the 200-unit Run cap and
must not change when a seeded Run reloads or moves between devices.

## Decision

- Every persistent Run unit receives a non-empty name in the same transaction that
  adds it to the player's army. This includes the starting King and three Pawns,
  the chosen opening-draft units, and purchased shop units.
- Name generation combines two curated 72-entry vocabularies into 5,184 possible
  names. A Run-seeded permutation plus the unit's monotonic acquisition ordinal
  makes the result reproducible and prevents duplicates through the 200-unit army
  cap.
- The generated name is stored on `RunArmyUnit`, not regenerated for display.
  Deployment projects it onto the live Battle piece so the existing selected-unit
  viewer and roster accessibility labels can use the persistent identity.
- The Run army, deployment choices, and relic target selectors show the name
  alongside the chess-piece type. The type remains explicit because a name never
  replaces chess identity.
- Run document format 2 requires names. Format-1 documents remain readable and are
  deterministically upgraded from their seed and stable unit ids before the next
  save.
- Name editing is deliberately deferred. Rank titles, kill thresholds, and
  cumulative service-record persistence are separate decisions and are not fixed
  by this ADR.

## Consequences

- A unit keeps one identity across Battles, retries, browser reloads, and signed-in
  cross-device persistence.
- Duplicate piece types are distinguishable before the future unit-name editor is
  introduced.
- Existing active Runs gain stable names without a destructive reset or a database
  schema migration because the active Run remains a versioned JSON document.
- Future editing can mutate the stored name without changing generation, deployment,
  or chess rules.
