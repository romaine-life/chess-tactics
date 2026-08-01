---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0050](0050-game-modes-placement-and-playability.md)"
  - "[ADR-0287](0287-deployment-is-a-dedicated-side-specific-authoring-workspace.md)"
refines:
  - "[ADR-0144](0144-level-editor-events-use-the-shell-workspace.md)"
---

# ADR-0288: New deployment authoring uses one flexible zone per side

## Context

ADR-0050 and ADR-0287 allowed a randomized side to select and pool several deployment
zones. The first dedicated Deployment UI exposed those choices as selectable rows.
With only one zone present, a row labeled only by selected/unused state did not explain
what was being selected. A dropdown would communicate choice more conventionally, but
would still preserve unnecessary cardinality: one painted zone can contain any number
of connected or disconnected squares and therefore already expresses every placement
pool the author needs.

## Decision

- New Deployment authoring owns at most one `player-spawn` zone and one `enemy-spawn`
  zone per level. Each zone may be painted in any shape, including disconnected groups
  of squares.
- The Deployment card does not present a zone selector, dropdown, checkbox list, or
  used/unused toggle. When a side has a starting zone, its nonzero randomized roster
  uses that zone automatically. The card names the zone and offers **Edit squares**.
  When none exists, the enabled card offers **Create player starting zone** or
  **Create enemy starting zone**.
- Turning a side's randomized roster off continues to remove its setup-spawn action
  while preserving its zone. The card states that the saved zone is kept for later and
  does not place units while randomization is off. A fixed-only side still needs no
  zone.
- Newly authored setup-spawn actions retain the compatible `zoneIds` array shape but
  write zero or one id. The runtime and structural reader continue accepting several
  ids so existing levels remain playable. When legacy content has several deployment
  zones, the editor chooses the referenced typed zone first, warns about the extras,
  and canonicalizes the setup event to one id on the next roster edit. It does not
  silently delete extra zone geometry.
- Creating a deployment zone is idempotent for its side: if the typed zone already
  exists, the command opens it for painting instead of creating another one.

## Consequences

- The author controls only the meaningful concepts: whether randomized units exist,
  their roster, and the painted squares where they may start.
- A one-zone level has no ambiguous control whose purpose becomes apparent only after
  additional zones are created.
- Compatibility arrays and pooled runtime reads remain an input migration boundary,
  not a capability exposed by new authoring UI.
