# Board rocks (neutral obstacles)

Source for the two neutral rock obstacles rendered onto the skirmish board
(`frontend/public/assets/units/rock/{boulder,granite}/*.png`).

- `render_rocks.py` — imports a rock model, normalizes it (scale so the largest
  dimension = target, base seated at z=0, centered), keeps its natural texture, and
  renders the 8 yaw rotations at the true-isometric contract camera (45° yaw /
  35.264° elevation / orthographic, ortho_scale 2.7, 512px). Anchor 50% / 80.241%,
  same as the unit roster.

  Run: `blender --background --python render_rocks.py -- <model> <outdir> 1.6 keep`

## Variants
- **boulder** — layered mossy boulder (GLB, embedded texture; dark slate with subtle moss).
- **granite** — lone granite round-boulder (FBX + jpg; neutral gray stone).

Rocks are neutral, so they are **not** team-palette-colored — each ships its 8 rotations
in one natural material. On the board, `SkirmishBoard.tsx` picks a variant + rotation
deterministically from each rock's piece id (`rockSpritePath`), so scattered rocks look
varied but stay stable across re-renders.

**Source models (license-pending, per the wider unit precedent):** a free "Layered Mossy
Boulder" GLB and a "lone granite boulder / round-boulder" FBX. Raw downloads are not
committed; the rendered sprites carry the geometry used. Confirm license before shipping.
