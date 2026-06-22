# Unit Footprint Calibration

This document records how Blender-rendered unit sprites are sized against the locked board tile.

## Tile Reference

Units are calibrated against the canonical tile contract:

- Tile canvas: `96x140px`
- Top diamond: `96x54px`
- Top-plane center: center of the diamond, currently rendered in Unit Studio at `--tile-anchor-x: 50%` and `--tile-anchor-y: 54px` on the 2x preview tile
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
- Alpha bounds: `x=88..423`, `y=8..482`
- Contact/anchor row: `y=367`
- Contact footprint row: `x=89..422`, width `334px`
- Anchor: `x=49.9%`, `y=71.753%`

Runtime metadata:

```ts
footprint: squareFootprint(512, 334)
unitAnchorX: '49.9%'
unitAnchorY: '71.753%'
```

At `100%` unit scale, the game renders the source image so the measured `334px` contact footprint maps to the canonical equal-area square footprint.

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
