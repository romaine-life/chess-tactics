---
status: superseded by 0277-the-card-scene-authoring-instrument-is-removed.md
date: 2026-07-31
deciders: owner (Nelson) + Codex
extends:
  - 0262-bundle-cards-are-scene-vignettes-with-authored-names-and-a-codex.md
  - 0071-the-deliverable-is-the-instrument.md
refines:
  - 0029-catalog-category-requirements.md
  - 0058-every-route-is-click-reachable.md
  - 0089-sfx-runtime-profile-is-db-authoritative.md
---

# ADR-0263: Card Scenes are an owner-authored Studio instrument

> **Superseded (2026-07-31):** the owner redirected card art to flavor-first
> illustration in a parallel workstream before any scene was authored, and this
> entire instrument was removed the same day it merged — see
> [ADR-0277](0277-the-card-scene-authoring-instrument-is-removed.md). The text
> below records the instrument as designed and shipped in PR #564.

## Context

ADR-0262's generated card vignettes are deterministic but not owner-editable:
seeded landmark, doodad, and prop placement produced compositions the owner
wanted to correct by hand, and the only editing affordance was a one-way
board-code hand-off into the Level Editor with no way to persist the result
back to the cards. The art-generation seeds are judged by the owner, so the
composition itself must be in his hands (ADR-0071). The interim standalone
`/studio?cardScenes=1` page was also a URL-only surface — the exact anti-pattern
ADR-0058 names.

## Decision

- The Studio gains a **Card Scenes** catalog category: every deck card's live
  vignette as a selectable grid with search (ADR-0029 contract; ADR-0058
  click-reachable by construction). The standalone `?cardScenes=1` page is
  retired into it. **Compose in Scene Editor** is the primary destination;
  a reduced `cardscene` Viewer keeps only the fixed export capture stage
  (`vk=cardscene&card=<id>&cardVariant=<v>`, the `npm run shot` target).
- **Composing is the real Level Editor**, not a parallel mini-editor (ADR-0059):
  `/editor/level?cardScene=<card-id>` opens the card's authored-or-generated
  scene as an **ephemeral, document-free board** — no level working copy, draft,
  or editing session is created — with the full placement interface (terrain,
  paths, fences, walls, subterrain, wall art, placed art, cover, scenic apron).
  Layers that do not translate are disabled, not hidden: Generate,
  Level Artwork, Unit, Zone, Rules, Status, Recovery, and Play test. The
  mustered units render but stay derived from the card and uneditable.
- The mode adds the **card viewing pane**: a board-space overlay rectangle at
  the capture aspect showing exactly what the final card renders — draggable on
  the stage, with X/Y/width slider controls (width = final-shot zoom). The
  live card window, the capture stage, and the installed-art plate all render
  precisely the saved pane (cover-fit; the default pane reproduces the original
  shared framing).
- Authored compositions persist as **one revisioned card-scenes document**
  (`card_scene_documents`, the ADR-0089 shape): public GET hydrates runtime and
  Studio at boot, the admin optimistic PUT saves the whole document, a missing
  row or entry means the generated scene, and there is no committed fallback.
  An override is `{ board?, frame?, salt? }`: the board is the **whole authored
  scene as a canonical unit-less board code** (the 3×3 tactical stage enforced),
  replacing the generated scene wholesale; the formation is always derived from
  the card at render time.
- The panel's **Load generated** restores the live baseline into the editor and
  **Delete saved** removes the override (ADR-0057: the baseline is derived from
  the generator, never a copied literal); **Re-deal** loads a differently-dealt
  generated scene; **Save scene** persists board + pane.

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
