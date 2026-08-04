---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0256](0256-individual-lipsana-are-routable-from-the-main-menu-enchiridion.md)'s bare and unknown fallback"
  - "[ADR-0408](0408-the-enchiridion-always-names-its-visible-section.md)'s always-visible-section scope"
  - "[ADR-0409](0409-the-title-route-is-a-clickable-breadcrumb.md)'s Units-root ancestor destinations"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0410](0410-address-derived-title-routes-belong-to-the-app-shell.md)"
---

# ADR-0411: Reference ancestors own empty routed roots

## Context

The clickable title breadcrumb originally sent both `Strategikon` and its nested
`Enchiridion` ancestor to the same Units address. Activating Strategikon therefore appeared
to do nothing, and neither reference shell could be open without implicitly exposing Units.
The standalone Enchiridion had the same forced fallback at `/enchiridion`.

## Decision

- Each reference ancestor owns a canonical empty address:
  - `/enchiridion` opens the standalone Enchiridion rail with no section selected;
  - `/play|/run/strategikon` opens the Strategikon rail with no primary section selected;
  - `/play|/run/strategikon/enchiridion` opens the nested Enchiridion rail with no reference
    selected.
- Activating a breadcrumb ancestor navigates to that exact root and removes every descendant
  from the visible route and workspace. `Units` is shown only at an explicit
  `/.../enchiridion/units` address.
- The main-menu Enchiridion destination and the closed Strategikon book open their empty roots,
  not Units. Strategikon section controls likewise open the selected section root; choosing
  Enchiridion does not preserve or synthesize a previous reference child.
- Empty roots render the retained rail and background only. They add no placeholder panel,
  explanatory copy, or implicit selected state.
- The scene graph represents each root as its retained shell with an empty content slot. Travel
  between a root and a child therefore uses the canonical empty-slot transition rather than a
  fake Units scene.
- Unknown descendants collapse to the nearest valid empty ancestor, while all explicit section
  and record addresses keep their existing behavior.

## Consequences

- `Strategikon`, `Enchiridion`, and `Units` are three distinct breadcrumb destinations rather
  than multiple labels for one page.
- A player may intentionally close the exposed reference while keeping either reference shell
  open.
- Rails show no active child at their empty roots, and the title route names only what is
  actually exposed.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
