---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0411](0411-reference-ancestors-own-empty-routed-roots.md)'s explicitly empty Enchiridion roots"
refines:
  - "[ADR-0256](0256-individual-lipsana-are-routable-from-the-main-menu-enchiridion.md)"
  - "[ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)"
  - "[ADR-0389](0389-the-title-route-names-the-visible-strategikon-address.md)"
---

# ADR-0408: The Enchiridion always names its visible section in the title route

## Context

The Enchiridion's Units, Terrain, Cards, Card Types, Lipsana, Abilities, and Ataraxia
sections are distinct routed workspaces. The persistent title bar nevertheless stopped at
`Enchiridion` on the main-menu host, leaving its exact location visible only as a selected
rail entry. ADR-0389 already required the complete nested Enchiridion ancestry inside a
Battle or Run Strategikon, but the same reference read differently depending on its host.

## Decision

- The standalone Enchiridion contributes its canonical section label to the persistent
  title route, so an address such as `/enchiridion/lipsana/quartermasters-ledger` reads
  `Enchiridion › Lipsana`.
- The section label comes from `ENCHIRIDION_SECTION_LABEL`, the same inventory consumed by
  the section rail and the Strategikon title route. Item addresses stay inside their owning
  section and do not add a second record-title vocabulary to the application route.
- The Battle- and Run-hosted Enchiridion keeps ADR-0389's complete visible ancestry, for
  example `Run › Sectio › Strategikon › Enchiridion › Lipsana`.

## Consequences

- The persistent title and the selected Enchiridion rail entry agree on both hosts.
- Deep item addresses retain compact orientation copy while still naming their visible
  reference section.

## More Information

- [UI art direction](../ui-art-direction.md)
- [Shared UI primitives](../shared-ui-primitives.md)
