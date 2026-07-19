---
status: "accepted"
date: 2026-07-19
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0046
  - ADR-0051
---

# ADR-0136: Loading is manifest-driven and frame-acknowledged

## Context

The application accumulated independent readiness mechanisms for startup catalogs,
menu chrome, menu icons, route chunks, campaign data, client-baked thumbnails, board
image preloads, and canvas renderers. These mechanisms answer different questions but
feed the same fades. In particular, the board preload gate proves that separate Image
objects decoded; it does not prove that the terrain canvas painted. Menu chrome is also
composed after App mount, while list thumbnails rebuild full boards after entering the
viewport. The result is late discovery, repeated work, and surfaces revealing in
visually impossible orders.

## Decision

Loading has one shared vocabulary and one owner-operable instrument.

1. Resources belong to `shell-critical`, `surface-critical`, or `opportunistic` tiers.
   Shell-critical resources produce stable global chrome. Surface-critical resources
   produce the destination's first complete viewport. Opportunistic work may start only
   after it cannot delay or disturb that frame.
2. A surface declares a complete resource manifest before its expensive renderer
   mounts. Intent warm-up fetches destination code, data, and the likely manifest—not
   code alone. Consumers share the decoded resources; a second preloader is not evidence
   that the real consumer is ready. These manifests are bounded projections of the
   Postgres-owned installed content and Blob-backed media governed by ADR-0106 and
   ADR-0085; they are not a parallel content authority.
3. Readiness requires an acknowledgement from the actual compositor after its first
   complete frame. Fetch completion, Image decode, React commit, and failsafe expiry are
   observable intermediate phases, never aliases for a painted frame.
4. A reveal boundary owns the complete visual stack. Terrain, sprites, chrome, overlays,
   and hit highlights may not independently escape it. Failsafes expose an explicit
   degraded state rather than silently declaring completion.
5. List thumbnails are immutable, size-appropriate live media derived at canonical
   save/publish boundaries. Visible-viewport thumbnails are surface-critical; below-fold
   thumbnails are opportunistic. Client board baking remains an authoring/preview tool,
   not the ordinary list delivery path.
6. Immutable bytes remain content-addressed under ADR-0085. Delivery measurements must
   distinguish browser cache, stable-slot redirect, backend buffer cache, Blob fetch,
   decode, composition, and paint. Optimization follows measured critical-path evidence.
7. Studio's Loading Lab is the canonical owner instrument. It uses one monotonic session
   clock, records resource timing and named lifecycle marks, filters by surface/kind,
   and exports JSON. Representative cold and warm journeys are main menu, Play with
   visible thumbnails, gameplay, and Level Editor.

ADR-0046/0051 remain authoritative for transition ownership and motion, but their
readiness clauses are refined: readiness-held entrances must consume the canonical
frame acknowledgement rather than a local fetch/decode proxy.

## Consequences

- Loading defects become failures against one timeline and vocabulary rather than a
  collection of animation symptoms.
- The first migration may expose duplicate loads and false readiness before removing
  them; the instrument is the required first deliverable.
- Persisted thumbnails and manifest endpoints add backend work at content mutation time
  in exchange for eliminating repeated client reconstruction.
- Canonical saves remain successful if disposable thumbnail preparation fails after the
  content transaction; responses report derivative readiness and the canonical read path
  retries generation. A derivative failure must never make an already-committed save look
  rolled back.
- Surface code must report real compositor completion, which requires explicit hooks in
  canvas and other asynchronous renderers.

## More Information

- [Loading contract](../loading-contract.md)
- [ADR-0046](0046-screen-and-control-transitions-are-orchestrated.md)
- [ADR-0051](0051-light-hop-exit-dissolve-and-readiness-held-entrances.md)
- [ADR-0071](0071-the-deliverable-is-the-instrument.md)
- [ADR-0085](0085-runtime-assets-are-live-storage-backed.md)
- [ADR-0106](0106-installed-content-is-database-owned.md)

