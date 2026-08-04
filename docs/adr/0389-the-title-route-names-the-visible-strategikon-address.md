---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)'s `Run › Sectio` route vocabulary"
  - "[ADR-0409](0409-the-title-route-is-a-clickable-breadcrumb.md)'s clickable breadcrumb interaction"
refines:
  - "[ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)"
  - "[ADR-0335](0335-the-strategikon-is-a-run-wide-reference-not-a-battle-only-workspace.md)"
  - "[ADR-0231](0231-battle-reference-material-lives-in-the-strategikon.md)"
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)"
---

# ADR-0389: The title route names the visible Strategikon address

## Context

ADR-0366 made the title's screen-name line a route and let a Run contribute its current phase,
such as `Run › Shop`. Opening Strategikon replaces the phase workspace without changing the
underlying Run phase, so the title continued to end at `Shop` while the screen visibly showed the
Chartulary, Prosopography, Lipsanotheca, or an Enchiridion reference. The route described the
covered parent instead of the place the player was looking at. The omission was most pronounced
inside the Enchiridion, where Units, Terrain, Cards, Card Types, Lipsana, Abilities, and Ataraxia
are separately routed subcategories.

## Decision

- The title route names the complete visible workspace ancestry. A Run keeps its underlying phase
  as the first contributed segment, then an open Strategikon appends `Strategikon` and the exact
  section. The requested example is therefore `Run › Shop › Strategikon › Chartulary`.
- The Enchiridion appends its routed reference as one further segment, for example
  `Run › Shop › Strategikon › Enchiridion › Card Types`. Prosopography, Chartulary, and
  Lipsanotheca are terminal section segments until their own address grammars gain routed children.
- This applies in every Run phase. A Run Battle reads `Run › Battle` and appends the Strategikon
  address while that workspace is open; Deployment and between-Battle phases do the same. The
  ordinary play host exposes the same section/reference suffix after its existing screen name.
- Route copy is derived from `strategikonAddress`, not reparsed from string suffixes. Strategikon
  section labels and Enchiridion reference labels are exported canonical inventories consumed by
  both their rails and the title route, so changing a destination name cannot leave the header
  behind.
- Closing Strategikon removes only its appended address and reveals the still-current parent
  phase. The title route remains orientation copy, never a second navigation control or a proxy
  for document state.

## Consequences

- The persistent title now agrees with the workspace occupying the screen and exposes nested
  reference context even when the content heading is outside the player's current focus.
- The Run phase remains truthful and stable rather than being overwritten by a temporary
  reference workspace.
- The longest current route is verified as one unclipped line at the standard gameplay viewport.

## More Information

- [Game concept](../game-concept.md)
- [UI art direction](../ui-art-direction.md)
- [UI kit standard](../ui-kit-standard.md)
