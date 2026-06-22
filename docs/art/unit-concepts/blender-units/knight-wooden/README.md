# Wooden Knight — board-calibrated candidate render

Turns the carved-wood Staunton knight OBJ into the unit family's eight-direction
candidate sprites, restyled navy so it sits alongside the other blue pieces.

- Source mesh: `docs/art/unit-concepts/source-assets/knight/wooden-chess-knight-side-b/`
  (OBJ + MTL + diffuse; ~78.9k tris). License/origin still unconfirmed, so this is
  a **Unit Studio candidate for review only**, not a production swap.
- Output: `frontend/public/assets/units/knight/candidate-wooden/{direction}.png`
  (8 × 512px, transparent), registered in `UnitStudio.tsx` as `knight-wooden`.

## Render contract

Reuses the production rook's board camera exactly (`render_versions.py`): a fixed
orthographic camera at 44.1° elevation; the **piece** rotates per compass
direction. The knight drops onto the same isometric tile scale as every other
unit.

- The source OBJ is Y-up with the base at +Y; `render_knight.py` uprights it
  (−90° about X), recenters X/Y, sits the base on Z=0, and scales to a 1.86-unit
  height.
- `transform_apply` no-ops under `blender --background` (no VIEW3D context), so all
  static transforms are baked straight into the mesh data via matrix math.
- The body uses a navy turned-wood material (`navy_wood`) — recolor == restyle to
  the blue family, per the integration brief.
- `FACING_OFFSET = -45` puts the classic side profile (muzzle to screen-left,
  matching `knight-south-concept.png`) in the south view.

## Reproduce

```sh
cd docs/art/unit-concepts/blender-units/knight-wooden
# pick the south-facing yaw (writes contact/south_yaw_*.png):
blender --background --python render_knight.py -- facing
# write all 8 catalog directions:
blender --background --python render_knight.py -- render
```

`inspect.py` is a one-off orientation probe (axis views) kept for reference.
`contact/` holds the yaw contact sheet that justified `FACING_OFFSET = -45`.
