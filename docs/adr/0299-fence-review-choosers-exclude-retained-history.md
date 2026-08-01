---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
refines:
  - "[Runtime asset contract](../runtime-asset-contract.md)"
  - "[Migration policy](../migration-policy.md)"
---

# ADR-0299: Fence review choosers exclude retained history

## Context

The live-media backend correctly retains immutable archived versions and migrated
`legacy-bridge` records. The fence review projection incorrectly treated those historical records
as selectable artwork. Its dated review route also substituted the first projected kit when a
requested id was absent. Together those behaviors could summon the rejected Blender Stone fence
even though it was neither a current candidate nor an available Level Editor fence option.

Retention is not availability. Historical bytes must remain available to provenance and backend
administration without becoming an owner-visible choice in an ordinary catalog or review route.

## Decision

- Fence review choosers project only complete backend `candidate` kits and current complete
  `accepted` kits. `legacy-bridge` and `archived` records never become chooser entries.
- Review selection is exact. A missing, retired, or unknown artwork id never falls back to a
  different kit; once the catalog resolves, the Level Editor removes the inapplicable review
  parameters and continues as the ordinary fence editor.
- The dated `fence-native-candidates-2026-07-10` route identity is retired. Launches from Studio
  use the generic `fence-art-candidates` identity and only exist when an actionable kit exists.
- Backend history remains intact. Removing an item from a chooser does not delete its immutable
  media or manufacture a new lifecycle state from filenames, labels, or Git metadata.
- Ordinary wood and stone fence options continue to come from the installed drawable catalog;
  the review catalog cannot supplement or replace those production choices.

## Consequences

- With the current backend catalog, which contains only retained fence bridges, the Studio fence
  review chooser is empty instead of exposing rejected or deprecated art.
- Old dated review links open the ordinary Level Editor and cannot restyle its fences with the
  rejected batch.
- A future fence candidate becomes visible only through an explicit backend candidate lifecycle;
  an accepted kit additionally remains subject to its registered acceptance and active-slot
  checks.
- Historical run records may retain old URLs as provenance, but no current documentation may
  present those URLs as supported review entry points.

## More Information

- [Runtime asset contract](../runtime-asset-contract.md)
- [Migration policy](../migration-policy.md)
- [Fence candidate projection](../../frontend/src/ui/fenceCandidateProfiles.ts)
