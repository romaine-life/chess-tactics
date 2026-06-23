# Unit Footprint Calibration

This document records how Blender-rendered unit sprites are sized against the locked board tile.

## Tile Reference

Units are calibrated against the canonical tile contract:

- Tile canvas: `96x140px`
- Top diamond: `96x55.426px` true-isometric geometry (`30 deg` screen-space edge)
- Top-plane center: center of the diamond, currently rendered in Unit Studio at `--tile-anchor-x: 50%` and `--tile-anchor-y: 55.426px` on the 2x preview tile
- Source of truth: `frontend/src/art/tileTemplate.ts`

The tile is the measuring stick. Unit scale should not be based on full sprite canvas bounds.

## Footprint Rule

Each unit declares a base/contact footprint centered on the tile center.

- Circle footprint area: `pi * r^2`
- Square footprint area: `s^2`
- Equal-area square side for a circle of diameter `D`: `D * sqrt(pi) / 2`

The current canonical circular footprint target is `96px`, so the equal-area square target is about `85px`.

## Active Blender Rook

Asset:

- `frontend/public/assets/units/rook/blender-render-v4-calibrated/*.png`

Measured south-render source:

- Source canvas: `512x512px`
- Alpha bounds: `x=138..373`, `y=58..448`
- Contact/anchor point: world origin `(0, 0, 0)`, projected through the Blender camera
- Contact footprint row: `x=138..373`, width `236px`
- Anchor: `x=50.000%`, `y=74.629%`

Runtime metadata:

```ts
footprint: squareFootprint(512, 236)
unitAnchorX: '50%'
unitAnchorY: '74.629%'
```

At `100%` unit scale, the game renders the source image so the measured `236px` contact footprint maps to the canonical equal-area square footprint. The anchor comes from `docs/art/unit-concepts/blender-units/rook-v4-calibrated/measure_rook_anchor.py`, using the same deterministic camera projection method as the knight. The base footprint was fitted in Blender with `docs/art/unit-concepts/blender-units/rook-v4-calibrated/fit_rook_base_to_tile.py`.

## Active Blender Knight

Asset:

- `frontend/public/assets/units/knight/blender-render-fur/*.png` (procedural navy fur coat; render recipe: `docs/art/unit-concepts/blender-units/knight-fur/render_knight_fur.py`)
- Supersedes the earlier `candidate-wooden` render (same OBJ, raw wood-grain diffuse — kept as historical candidate).

- Source canvas: `512x512px`
- Contact footprint (max projected base width): `178px`
- **Anchor: `x=50%`, `y=80.241%`** — the *exact* projection of the unit's ground-contact point (base bottom-center = world origin) through the render camera, via `world_to_camera_view`. Not measured/eyeballed: it's deterministic, so seating is mathematically correct.

Runtime metadata:

```ts
footprint: circleFootprint(512, 178)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

At `100%` unit scale, the game renders the source image so the measured `178px` contact footprint maps to the canonical circular footprint.

> **On computing the anchor.** Don't measure the alpha base row — in isometric the widest base row is the back rim, which projects *higher* than the true contact (this caused an earlier off-by-22px error). The correct anchor is `world_to_camera_view(scene, cam, (0,0,0))` with the unit's base normalized to z=0 and centered at the origin: `anchorX = v.x`, `anchorY = 1 - v.y`. Requires a `view_layer.update()` first so the camera matrix is evaluated.

## Next Blender Export Rule

For every new Blender unit export:

1. Render with the accepted tile in the Blender scene as the visual calibration reference.
2. Export unit-only transparent sprites from the same camera.
3. Measure the contact footprint width/diameter in source pixels.
4. Store `sourceCanvasPx`, `sourceFootprintPx`, `unitAnchorX`, and `unitAnchorY`.
5. Keep old AI/generated art as historical reference, not active app catalog entries.
