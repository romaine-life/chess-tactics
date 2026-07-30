---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0234: Derived thumbnails use exact render-dependency fingerprints

## Context

Stored level thumbnails were versioned with the global prop-seat, unit,
live-media, and drawable catalog revision counters. Those counters correctly
identify a coherent catalog snapshot, but they do not describe the dependencies
of one thumbnail. Accepting an unrelated recording or UI asset therefore made
every level derivative appear stale.

The read-repair path then attempted the complete stale set together. A Play
selector request could turn one unrelated catalog update into dozens of board
renders, saturating the backend before the destination could reveal.

This is the cache equivalent of declaring every file in a repository as an
input to every build action. It is safe but unnecessarily broad, and the
resulting invalidation storm is itself an availability defect.

## Decision

- A derived thumbnail's content version is a deterministic fingerprint of only
  the inputs that can change its pixels:
  - the thumbnail renderer and dependency-schema revisions;
  - the exact resolved render plan, including geometry, framing, draw
    operations, occlusion inputs, and immutable source identities;
  - the current content hash behind any semantic source URL that remains in the
    plan; and
  - the critical/decorative availability behavior of every consumed source.
- Global catalog revision counters select and isolate one coherent renderer
  snapshot. They do not participate in derivative validity. A catalog update
  causes the server to project the current plan and compare its exact
  fingerprint; unrelated changes remain cache hits.
- Compact list thumbnails and full level-card/OG renders own distinct exact
  manifests. Level cards additionally fingerprint their title text, scene
  background, font, and UI media.
- Canonical save and publish continue preparing current derivatives.
  Read-through repair remains the fail-closed recovery path required by
  ADR-0136, but identical concurrent requests coalesce and every render passes
  through one process-wide bounded FIFO limiter.
- A genuinely changed visible thumbnail is repaired before the Play surface
  reveals. The application does not show stale pixels while rebuilding.
  Below-fold acquisition remains opportunistic under ADR-0136.
- The retired global-revision version format has no runtime compatibility
  branch. Existing disposable derivatives repair once into the exact format.

## Consequences

- Accepting SFX, relic art, or other unrelated media cannot invalidate level
  thumbnails.
- Updating a source used by many boards still invalidates those boards, because
  their pixels genuinely changed, but repair cannot overwhelm the process.
- Exact plan projection is required before validation. It is metadata/geometry
  work performed once per coherent snapshot, not one media decode or full
  renderer hydration per level.
- Renderer changes must still advance their explicit revision even when the
  resolved plan shape is unchanged.

## More Information

- [ADR-0085](0085-runtime-assets-are-live-storage-backed.md)
- [ADR-0106](0106-installed-content-is-database-owned.md)
- [ADR-0136](0136-loading-is-manifest-driven-and-frame-acknowledged.md)
- [Loading contract](../loading-contract.md)
