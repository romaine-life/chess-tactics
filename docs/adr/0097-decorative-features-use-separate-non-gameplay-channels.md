---
status: superseded by ADR-0098
date: 2026-07-15
deciders: Nelson, Codex
superseded_by: 0098-authored-board-extends-beyond-playable-grid.md
---

# ADR-0097: Decorative features use separate non-gameplay channels

## Decision

The Level Editor's Road and Fence tools expose a **Scenic placement** toggle. Off preserves ordinary
playable-cell authoring. On permits roads, fence rails, and fence posts on scenic terrain around the
playable grid for art-handoff composition. The Wall tool owns a related but independent
**Decorative faces** toggle: decorative tiles accept only north and west wall faces because south
and east faces obstruct the fixed-camera board.

Decorative roads, fences/posts, and walls persist in dedicated `EditorBoard` channels. They reuse
the canonical road autotiler and fence/wall render primitives, but `editorBoardToLevel` never
projects them into terrain, blocked edges, collision, movement, or solver state. Playable and
decorative channels may meet visually without sharing gameplay authority.

## Consequences

- Art handoff can own a composed border rather than asking image generation to invent it.
- Ordinary road/fence/wall authoring remains unchanged when the relevant toggle is off.
- Decorative walls are arbitrary north/west faces, not a relaxation of the gameplay perimeter-wall
  rule.
