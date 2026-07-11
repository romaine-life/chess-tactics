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

## Active Rook

Asset:

- Accepted frames live in Unit Art storage. The authored Blender source is
  `docs/art/unit-concepts/blender-units/rook-claude/units/rook-ruinwall/model.blend`;
  `python scripts/generate-unit-art.py render rook ...` renders its exact
  eight-direction turntable through the accepted-only Ruinwall renderer.

Measured south-render source:

- Source canvas: `512x512px`
- Contact/anchor point: world origin `(0, 0, 0)`, projected through the Blender camera
- Published square footprint: `428px`
- Published anchor: `x=50%`, `y=80.241%`

Runtime metadata:

```ts
footprint: squareFootprint(512, 428)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

At `100%` unit scale, the game maps the published `428px` square footprint to the
canonical equal-area square footprint. Unit Art owns these live values; the retired
v2-v4 rook experiments are historical candidates, not the accepted rook source.

## Active Blender Knight

Asset:

- `.unit-art-output/knight/navy-blue/*.png` (procedural navy fur coat; render recipe: `docs/art/unit-concepts/blender-units/knight-fur/render_knight_fur.py`)
- Supersedes the earlier `candidate-wooden` render (same OBJ, raw wood-grain diffuse,
  now retained only in the private historical archive).

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

## Active Blender Pawn

Asset:

- `.unit-art-output/pawn/navy-blue/*.png` (classic Staunton pawn + medieval archer's helmet, navy). Recipe: `docs/art/unit-concepts/blender-units/pawn-helmet/render_pawn_helmet.py`. Source models: `docs/art/unit-concepts/source-assets/pawn-helmet/`.

Calibration (same camera + base-at-origin normalization as the knight):

- Source canvas: `512x512px`
- Contact footprint (max projected base width): `188px`
- **Anchor: `x=50%`, `y=80.241%`** — computed via `world_to_camera_view(scene, cam, (0,0,0))` (the ground-contact projection), identical to the knight because the camera and normalization are identical.

```ts
footprint: circleFootprint(512, 188)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

The pawn body is rotationally symmetric; the helmet's visor provides the per-direction facing (visor → game-south at yaw 0).

## Active Blender King

Asset:

- `.unit-art-output/king/navy-blue/*.png` (navy Staunton king + gold/jewel crown, hand-fitted). Source + recipe: `docs/art/unit-concepts/blender-units/king-crown/` (`king_crown.blend` is the hand-assembled source of truth; `render_king_crown.py` re-renders it).

Calibration (same camera + base-at-origin normalization as the rest of the roster):

- Source canvas: `512x512px`
- Contact footprint (max projected base width): `148px`
- **Anchor: `x=50%`, `y=80.241%`** — computed via `world_to_camera_view(scene, cam, (0,0,0))`.

```ts
footprint: circleFootprint(512, 148)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

The crown was hand-fitted in Blender (not scripted), so unlike the pawn/knight there's no procedural recipe — the assembled `.blend` is the source. King + crown are rotationally symmetric (no per-direction facing).

## Active Blender Bishop

Asset:

- `.unit-art-output/bishop/navy-blue/*.png` (navy Staunton bishop + navy mitre, hand-fitted). Source + recipe: `docs/art/unit-concepts/blender-units/bishop-mitre/` (`bishop_mitre.blend` is the hand-assembled source of truth; `render_bishop_mitre.py` re-renders it).

Calibration (same camera + base-at-origin normalization as the rest of the roster):

- Source canvas: `512x512px`
- Contact footprint (max projected base width): `158px`
- **Anchor: `x=50%`, `y=80.241%`** — computed via `world_to_camera_view(scene, cam, (0,0,0))`.

```ts
footprint: circleFootprint(512, 158)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

The mitre was hand-fitted in Blender (not scripted) — the assembled `.blend` is the source. Unlike the king, the mitre's front peak gives a genuine per-direction facing across the 8 sprites.

## Active Blender Queen

Asset:

- `.unit-art-output/queen/navy-blue/*.png` (navy Staunton queen + jeweled gold tiara, hand-fitted). Source + recipe: `docs/art/unit-concepts/blender-units/queen-tiara/` (`queen_tiara.blend` is the hand-assembled source of truth; `render_queen_tiara.py` re-renders it).

Calibration (same camera + base-at-origin normalization as the rest of the roster):

- Source canvas: `512x512px`
- Contact footprint (max projected base width): `150px`
- **Anchor: `x=50%`, `y=80.241%`** — computed via `world_to_camera_view(scene, cam, (0,0,0))`.

```ts
footprint: circleFootprint(512, 150)
unitAnchorX: '50%'
unitAnchorY: '80.241%'
```

The tiara was hand-fitted in Blender (not scripted) — the assembled `.blend` is the source. Like the bishop, the tiara's front gives a genuine per-direction facing across the 8 sprites.

## Delivery Raster Rule

For genuinely new Blender-authored unit art:

1. Choose the delivery raster in Unit Studio.
2. Render unit-only transparent sprites directly at that width and height from the calibrated camera.
3. Reject the run if authored and delivery dimensions differ or any spatial resampling occurred.
4. Measure the contact footprint width/diameter on that native source grid.
5. Store `sourceCanvasPx`, `sourceCanvasHeightPx`, `sourceFootprintPx`, `unitAnchorX`, and `unitAnchorY`.
6. Keep old AI/generated art as historical reference, not active app catalog entries.

For a size-only revision of accepted art:

1. Treat the complete accepted 6-palette x 8-direction asset as the immutable visual source.
2. Preserve source aspect ratio inside the Unit Studio delivery raster and reduce with deterministic premultiplied-alpha area sampling.
3. Scale `sourceFootprintPx` by the same horizontal canvas ratio and preserve the accepted anchor.
4. Record source asset id, source dimensions, contained dimensions, delivery dimensions, and `spatialResampling: true` in candidate provenance.
5. Review the delivery pixels on the board before accepting. At logical `100%`, the accepted result is drawn 1:1.
