---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)'s orientation-copy-only route"
  - "[ADR-0389](0389-the-title-route-names-the-visible-strategikon-address.md)'s prohibition on title-route navigation"
partially_superseded_by:
  - "[ADR-0411](0411-reference-ancestors-own-empty-routed-roots.md)'s distinct empty ancestor destinations"
refines:
  - "[ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)"
  - "[ADR-0408](0408-the-enchiridion-always-names-its-visible-section.md)"
---

# ADR-0409: The title route is a clickable breadcrumb

## Context

The persistent screen-name line already displayed a route such as
`Run › Sectio › Strategikon › Enchiridion › Lipsana`, but ADR-0366 and ADR-0389
classified that route as orientation copy and explicitly prohibited navigation. The result
looked like a breadcrumb while refusing the breadcrumb behavior its visible ancestry promised.
The standalone Enchiridion inherited the same mismatch when ADR-0408 added its section.

## Decision

- A title route is a compact breadcrumb. Its base screen name and every contributed segment
  are clickable, keyboard-focusable navigation controls.
- These controls are `NavButton`s under ADR-0052, not anchors: they change the canonical
  address without exposing browser link affordances. They remain frameless title text and
  reveal their interactivity through the shared hover/focus treatment.
- Each segment owns its canonical address. `Enchiridion` opens its Units root and a section
  opens `/enchiridion/<section>`; a deep item address therefore collapses to its owning
  section when that breadcrumb is activated. A Run phase returns to `/run`, Strategikon and
  its Enchiridion parent open the canonical Units reference, and terminal/reference segments
  open their exact parsed Strategikon addresses. Relevant search identity is preserved.
- The route parsers export both labels and destinations. Rails, scene identity, and title
  breadcrumbs may not maintain parallel path logic.
- Breadcrumb buttons are intrinsic members of the leading title route. They do not enter the
  trailing typed action lane and do not authorize arbitrary buttons in `TitleBarSlot`.

## Consequences

- The visible hierarchy is now both orientation and navigation: every named ancestor can be
  revisited directly with mouse, keyboard, or touch.
- The title keeps the compact typography and layout already verified at responsive widths.
- A current terminal segment may be activated; canonical same-address navigation remains a
  harmless no-op, while a deep record address intentionally returns to its section root.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
