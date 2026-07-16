---
status: accepted
date: 2026-07-15
deciders: Nelson, Codex
supersedes: ADR-0096 placement restrictions; ADR-0097
---

# ADR-0098: The authored board extends beyond the playable grid

## Decision

The Level Editor owns one rectangular authored visual board. Its inner playable rectangle is a
gameplay projection, not the renderer's or ordinary visual tools' coordinate boundary. Terrain,
roads, rivers, fences, north/west wall faces, props, doodads, and ground cover use their normal
authoring and rendering behavior anywhere in the authored rectangle; no Scenic-placement toggle or
parallel per-tool workflow is required.

Units and gameplay zones remain restricted to the playable rectangle. Saving preserves the complete
authored scene in board code, while `editorBoardToLevel` projects terrain, units, zones, props,
barriers, collision, movement, objectives, promotion, and solver state only from playable
coordinates. Outer artwork therefore has no gameplay authority.

Legacy decorative road/fence/post/wall channels remain readable and are folded into the canonical
visual render/edit path so existing working copies do not lose artwork.

## Consequences

- Art-handoff composition uses ordinary tools across one continuous board.
- Renderer behavior no longer changes at the playable boundary.
- Gameplay isolation is an explicit export projection with regression coverage.
- ADR-0096 remains authoritative for independent scenic extents and static apron rendering, but its
  prohibition on outer placement targets is superseded. ADR-0097 is superseded.
