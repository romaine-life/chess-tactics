---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0369](0369-shell-and-scene-reveal-on-one-explicit-ladder.md)"
  - "[ADR-0389](0389-the-title-route-names-the-visible-strategikon-address.md)"
  - "[ADR-0409](0409-the-title-route-is-a-clickable-breadcrumb.md)"
---

# ADR-0410: Address-derived title routes belong to the App shell

## Context

ADR-0409 made the persistent title route clickable, but the ordinary Play host still
contributed its Strategikon ancestry from inside the replaceable battlefield scene. During
loading or a scene handoff, that scene is deliberately inactive, so the persistent title bar
could show only its base screen name while the browser already addressed an Enchiridion
workspace. The complete route was therefore not actually persistent everywhere.

## Decision

- Breadcrumb segments determined entirely by the committed address are part of
  `titleBarConfig` and render directly through the persistent App-owned `BrandLockup`.
- Standalone Enchiridion sections and ordinary Play-hosted Strategikon ancestry use this path.
  They do not wait for a replaceable scene, board readiness, or a route portal to activate.
- A route portal is reserved for segments that require live document state unavailable from
  the address. The Run phase remains such a contribution; its title route continues to append
  address-derived Strategikon segments after that phase in one ordered breadcrumb.
- Both paths render the same shared `TitleRoute` primitive and the same canonical parser-owned
  destinations. A screen may not maintain a parallel label or destination table.

## Consequences

- Every address-only title route is present and clickable as soon as the persistent shell
  commits that address, including while the corresponding gameplay scene is still loading.
- Replaceable scene activation can no longer suppress standalone Enchiridion or Play-hosted
  Strategikon ancestry.
- Dynamic Run state remains truthful without moving Run documents into the App shell.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
