---
status: "accepted"
date: 2026-07-27
deciders: Nelson, Codex
supersedes:
  - ADR-0046
  - ADR-0049
  - ADR-0051
refines:
  - ADR-0136
---

# ADR-0201: Navigation loads atomic scenes through one director

## Context

The application has a cold-menu reveal, screen entrance hook, light-route exit
store, heavy-route veil, Suspense fallback, board-art store, and local painted
surface boundaries. Each is locally reasonable, but none owns a complete
navigation. Controls, title chrome, backgrounds, thumbnails, and board layers
therefore reveal on different clocks.

The product model is a **scene**, not a route component or individual asset.
Adding a screen must enroll a complete visual hierarchy just as title-bar controls
enroll through the title-bar hierarchy; leaf components may not invent loading
presentation or reveal timing.

## Decision

One application-level scene director owns initial composition and every screen
navigation.

### Scene contract

Every navigable destination declares a stable scene identity, background layer,
chrome/control root, bounded first-viewport manifest, paint acknowledgements,
opportunistic work, and retryable terminal failure presentation. The manifest
vocabulary and painted-frame requirement remain those of ADR-0136. A synchronous
route declares an explicit empty manifest; omission is not an opt-out.

### Navigation lifecycle

The only legal lifecycle is:

`current → locked → exiting → loading → destination-painted → entering → current`

1. Activation is accepted immediately and the current scene becomes inert.
2. Current controls fade out as one hierarchy. The current background stays painted.
3. The director gracefully presents centered **Loading…** and observes a minimum beat.
4. Destination code, data, fonts, visible thumbnails, background, controls, and
   critical pixels prepare while unrevealed.
5. The destination reports a real painted-frame acknowledgement. Fetch, decode,
   React commit, timeout, and absence of a known blocker are not readiness.
6. Loading copy fades away. The destination background and controls fade in together
   as one scene over the old background.
7. Once the new background is opaque, the old scene is released and interaction resumes.

Retargeting keeps only the last accepted destination and cancels stale acquisition.
Failure preserves a coherent background and replaces Loading with one scene-owned
retry surface.

### Initial startup lifecycle

Startup is the sole staged reveal: completely fade in the background, hold a minimum
beat, completely fade in the title bar, hold again, then fade in the main-menu controls
as one unit. Network completion may lengthen a stage but never collapse or reorder the
choreography. Startup copy may not paint in a fallback font.

### Viewport rule

Everything visible in the initial viewport is scene-critical, including thumbnails.
Below-fold content is opportunistic, has reserved geometry, and is acquired before it
can enter the viewport.

### Ownership and enforcement

- `SceneDirector` is the sole navigation transition state machine.
- `SceneBoundary` owns reveal, inertness, error, and paint acknowledgement.
- `SceneManifest` is the declaration API.
- Consumers register with their scene; local spinners and independent reveal fades
  are forbidden for first-frame content.
- Progressive loading is valid only for a user-requested sub-surface inside an
  already complete scene with stable geometry.
- Loading Lab displays active scene, phase, manifest members, unresolved work,
  cancellation, failure, and reveal acknowledgement.

## Consequences

The route veil, `screenExit`, `useScreenEntrance`, cold reveal store, generic Suspense
fallback, and optional local readiness Booleans are migration sources, not parallel
systems to retain. Background continuity comes from retaining the old scene, not a
homepage-only exception. Migration is complete only when every route family declares
a manifest and the retired mechanisms are deleted.
