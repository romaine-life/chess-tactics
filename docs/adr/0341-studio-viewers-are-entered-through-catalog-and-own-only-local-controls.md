---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0029](0029-catalog-category-requirements.md)'s visible Viewer-kind selector requirement"
refines:
  - "[ADR-0058](0058-every-route-is-click-reachable.md)"
  - "[ADR-0339](0339-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)"
---

# ADR-0341: Studio Viewers are entered through Catalog and own only local controls

## Context

Studio already has one cross-kind directory: Catalog. A Catalog category selects
an item or instrument and its Open/Inspect action enters the corresponding
Viewer kind. Injecting the complete Viewer-kind registry as another dropdown at
the top of every Viewer rail duplicated that directory after the destination had
already been chosen. It made a focused instrument such as Card Icon Fitting look
like a catalog switcher and spent scarce rail space on unrelated destinations.

The running application also no longer has an in-place Studio board Lab. The
Lab title-bar control navigates to the canonical Level Editor. The living Studio
contract still described three persistent in-place workspaces and therefore no
longer matched the implemented navigation model.

## Decision

- Studio has two in-place states: **Catalog** and **Viewer**. The title bar keeps
  Catalog, Lab, and Viewer affordances, but Lab is navigation to the canonical
  Level Editor rather than an in-place Studio mode.
- Catalog is the sole cross-kind browser. Its category selector chooses what is
  browsed, and Open/Inspect enters the selected item's or instrument's Viewer.
- A Viewer rail is headed **Controls** and contains shared preview controls, when
  applicable, followed by controls and details owned by that Viewer. It must not
  render a global Viewer-kind or Catalog-category selector.
- `viewerKind` remains the typed route and state identity. Existing `vk=` deep
  links, legacy aliases that canonicalize into Studio, the title-bar Viewer
  affordance, and contextual transitions to a directly related Viewer remain
  valid. Removing the visible directory does not collapse the registry or its
  addressability.
- The Catalog title-bar affordance is the standard return path. Viewer-specific
  Back controls and bespoke layouts remain prohibited.

## Consequences

Viewer instruments stay focused on the thing the owner opened, the controls rail
recovers useful vertical space, and Studio has only one visible directory of its
many kinds. New Viewer kinds still register with the shared route registry and
must be click-reachable through Catalog, but they do not automatically become
options in a second global menu.
