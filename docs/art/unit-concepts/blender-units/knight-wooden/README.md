# Wooden Knight — board-calibrated candidate render

Turns the carved-wood Staunton knight OBJ into the unit family's eight-direction
candidate sprites, restyled navy so it sits alongside the other blue pieces.

- Source mesh: `docs/art/unit-concepts/source-assets/knight/wooden-chess-knight-side-b/`
  (OBJ + MTL + diffuse; ~78.9k tris). License/origin still unconfirmed, so this is
  a **Unit Studio candidate for review only**, not a production swap.
- Output: `frontend/public/assets/units/knight/candidate-wooden/{direction}.png`
  (8 × 512px, transparent), registered in `UnitStudio.tsx` as `knight-wooden`.

## Facing convention (this is the part that must not drift per-unit)

The unit-render convention is documented in
[`docs/art/unit-concepts/README.md`](../../README.md) ("South Direction Lock") and
encoded in the production rook's `render_versions.py` `DIRECTIONS` dict, which
`pieces_claude.py` (the `candidate-claude` pieces) also uses verbatim:

- This pass used the older board camera in the +X / −Y / +Z (NE) quadrant at
  44.1° elevation. That camera is now **legacy**. New Blender unit renders should
  follow `docs/blender-projection-contract.md` instead.
- **South = object yaw 0 with the piece's FRONT pointing local −Y.** The fixed
  camera projects −Y to screen lower-left, so a correctly-aligned knight shows its
  muzzle lower-left in a 3/4 profile — matching `candidate-claude/south.png`.
- The other seven sprites are *pure* `DIRECTIONS` rotations of the piece
  (`S=0, SE=45, E=90 … N=180`). **No per-direction aesthetic offset** — that is
  exactly what makes every unit's facing line up without hand-correction.

So integrating any new unit is: upright it, then set `MODEL_FRONT_YAW` (a one-time
rotation about Z) so its front points −Y. For this OBJ the muzzle already lands on
−Y after uprighting, so `MODEL_FRONT_YAW = 0`.

## Render contract

Reuses the rook board camera exactly; the **piece** rotates per compass direction.

- The source OBJ is Y-up with the base at +Y; `render_knight.py` uprights it
  (−90° about X), recenters X/Y, sits the base on Z=0, and scales to 1.86 units.
- `transform_apply` no-ops under `blender --background` (no VIEW3D context), so all
  static transforms are baked straight into the mesh data via matrix math.
- The body uses a navy turned-wood material (`navy_wood`) — recolor == restyle to
  the blue family, per the integration brief.

## Reproduce

```sh
cd docs/art/unit-concepts/blender-units/knight-wooden
# verify front alignment (writes contact/probe_top.png + probe_south.png):
blender --background --python render_knight.py -- probe          # uses MODEL_FRONT_YAW
blender --background --python render_knight.py -- probe 15        # try a 15deg front yaw
# write all 8 catalog directions (convention: DIRECTIONS, no offset):
blender --background --python render_knight.py -- render
```

`inspect.py` is a one-off orientation probe (axis views). `mode_facing`
(`-- facing`) sweeps the south view at 8 yaws as a coarse alignment check.
