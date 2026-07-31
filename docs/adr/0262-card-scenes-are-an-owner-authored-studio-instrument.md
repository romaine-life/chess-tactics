---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - 0261-bundle-cards-are-scene-vignettes-with-authored-names-and-a-codex.md
  - 0071-the-deliverable-is-the-instrument.md
refines:
  - 0029-catalog-category-requirements.md
  - 0058-every-route-is-click-reachable.md
  - 0089-sfx-runtime-profile-is-db-authoritative.md
---

# ADR-0262: Card Scenes are an owner-authored Studio instrument

## Context

ADR-0261's generated card vignettes are deterministic but not owner-editable:
seeded landmark, doodad, and prop placement produced compositions the owner
wanted to correct by hand, and the only editing affordance was a one-way
board-code hand-off into the Level Editor with no way to persist the result
back to the cards. The art-generation seeds are judged by the owner, so the
composition itself must be in his hands (ADR-0071). The interim standalone
`/studio?cardScenes=1` page was also a URL-only surface — the exact anti-pattern
ADR-0058 names.

## Decision

- The Studio gains a **Card Scenes** catalog category: every deck card's live
  vignette as a selectable grid with search, and **Open Scene Lab** as its
  View-Selected destination (ADR-0029 contract; ADR-0058 click-reachable by
  construction). The standalone `?cardScenes=1` page is retired into it.
- The **Scene Lab** is a `cardscene` Viewer kind: the fixed capture stage
  (source / with-units / live variants) beside owner controls — landmark mode
  (generated / none / custom with artwork, facing, X/Y/scale), scene-wide
  ground-cover mode, per-cell doodads and props, and a re-deal salt. Deep links
  ride the ordinary Studio URL (`vk=cardscene&card=<id>&cardVariant=<v>`), which
  is also the `npm run shot` capture target.
- Authored compositions persist as **one revisioned card-scenes document**
  (`card_scene_documents`, the ADR-0089 shape): public GET hydrates runtime and
  Studio at boot, the admin optimistic PUT saves the whole document, a missing
  row or entry means the generated scene, and there is no committed fallback.
- An override replaces its generated channel **wholesale** (landmark, doodads,
  props, cover); terrain and the unit formation stay generated from the
  canonical card id plus the saved salt. Every card consumer — draft, shop,
  Enchiridion, art capture — resolves overrides through the one scene plan.
- **Reset to generated** previews the pure baseline, derived live from the
  generator (ADR-0057: authoritative baseline, never a copied literal); Save
  persists, Revert discards to the saved override.
- The Level Editor hand-off remains as a secondary affordance from the Lab
  (board-code deep link), for edits beyond the Lab's channels.

## Consequences

- The owner composes and persists card scenes end to end without an agent in
  the loop; generation is the default, authorship is the exception per card.
- Scene determinism survives authorship: plan = f(card id, salt, override,
  live catalogs), so captures and runtime faces stay reproducible.
- The document is global dev/prod content like the SFX profile; per-account
  scenes are out of scope.
- The Lab's per-cell selects are terrain-gated like the board brush; freeing
  placement beyond that (or direct on-stage dragging) is future Lab polish,
  not a persistence change.
