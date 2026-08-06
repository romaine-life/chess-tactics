---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0113](0113-predrawn-calibration-can-snap-to-the-canonical-grid-shape.md)"
  - "[ADR-0135](0135-predrawn-registration-is-owner-picked-source-geometry.md)"
  - "[ADR-0178](0178-predrawn-grid-fitting-uses-one-reversible-edit-history.md)"
---

# ADR-0467: First-time grid fitting starts from the game grid

## Context

The raw-artwork fitter previously opened with no grid. It required four manual
corner placements before it could render any fitted lines or enable the
canonical grid snap. The Level already knows its row and column count and the
runtime projection, so making the owner reconstruct that geometry concealed the
useful starting point.

After the canonical shape is visible, the owner also needs to change its overall
size without independently moving four corners and accidentally changing its
angles or cell aspect.

## Decision

When a raw artwork version has no prior registration, the fitter immediately
seeds a centered grid from the Level's actual row and column count and the
canonical `TILE_STEP_X`/`TILE_STEP_Y` projection. It uses one uniform scale and
leaves margin inside the source image. This is pending owner-editable state, not
automatic acceptance or saved authority.

Coarse mode exposes explicit uniform-size decrease and increase controls. Each
scales every outer corner around the shared center by the same factor, preserving
the complete current grid shape. The controls stop at the artwork boundary and
remain locked while local mesh corrections exist. Each proportional scale action
is one reversible grid-history edit.

The existing free corner controls and **Snap ideal grid** remain available. They
continue to give the owner final authority over the painted geometry.

## Consequences

- First-time fitting begins with the real gameplay grid visible.
- Moving and proportional sizing are sufficient for a correctly projected image;
  individual corner placement is only needed when the artwork itself drifts.
- Automatic seeding never saves, derives, or outranks an owner edit.

## Verification

- Opening an unregistered raw shows a complete centered canonical grid.
- Uniform decrease and increase preserve center, angles, and relative dimensions.
- Uniform sizing stops at source bounds, is disabled with local corrections, and
  participates in Undo/Redo.
