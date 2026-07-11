# Tile pipeline — explicit top and side layers

Production board tiles are two independent 96×180 PNG layers:

```text
public/assets/tiles/surface/<family>-<variant>-side.png
public/assets/tiles/surface/<family>-<variant>-top.png
```

The renderer draws the side first and the top over it. A production tile path without
`-top` or `-side` is retired; the pipeline neither reads nor emits combined tile sprites.

## Geometry and ownership

The canonical top diamond is apex `(48,41)`, right `(96,68)`, front `(48,95)`, left
`(0,68)` in a 96×180 frame. Top and side ownership is determined by alpha:

- TOP owns visible pixels inside that diamond.
- SIDE owns visible pixels outside that diamond.
- Builders affine-project flat source material into the diamond with nearest-neighbour
  sampling, then emit native 96x180 frames. There is no hidden pre-shrink or fractional
  runtime/display scaling; board placement stays on integer pixels.

The source templates retain transparent RGB so the structural migration can reproduce
the already-reviewed seam pixels exactly. Those RGB values are not drawn: alpha remains
the layer-ownership contract.

## Committed inputs and outputs

| Purpose | Path |
| --- | --- |
| Flat generated top-material pools (16 per family) | `docs/art/pixellab-runs/surfaces/<family>/tile_<i>.png` |
| Curated pool index → runtime variant | `CURATION_MAP` in `build-surface-tiles.py` |
| Side-owned source pixels | `docs/art/tile-concepts/side-templates/<family>-side.png` |
| Accepted top seam underlay | `docs/art/tile-concepts/top-underlays/<family>-top-underlay.png` |
| Frayed edge alpha sources | `docs/art/tile-concepts/edge-masks/<family>-edge-side.png` |
| Runtime base layers | `frontend/public/assets/tiles/surface/<family>-<variant>-{top,side}.png` |
| Runtime rich/mural edges | numbered `frontend/public/assets/tiles/surface/*-side.png` files |

The six side templates and six top underlays are the minimal production source pixels
extracted from the retired whole-tile intermediates. The old whole-tile images are not a
build dependency.

## Generate and curate a top family

1. Generate a flat top-down surface pool with PixelLab. The useful material parameters
   are:

   ```text
   tile_type=square_topdown
   tile_view=top-down
   tile_view_angle=90
   tile_depth_ratio=0
   tile_size=64
   outline_mode=segmentation
   ```

   The prompt should request a flat, seamless material viewed directly from above, with
   no border, cube, side face, perspective, prop, or isolated landmark.

2. Commit the returned source images under
   `docs/art/pixellab-runs/surfaces/<family>/`. Use `tile-contact-sheet.py` and the real
   board viewer to curate them, then update `CURATION_MAP`.

3. Check the proposed bake before writing anything:

   ```powershell
   python frontend/scripts/build-surface-tiles.py --check
   ```

   A mismatch is reported per layer and is not overwritten. If the owner has reviewed
   and accepted the art change, write it explicitly:

   ```powershell
   python frontend/scripts/build-surface-tiles.py --accept-art-change
   ```

   With no flag, the script rebuilds only when every existing runtime layer is already
   pixel-identical. This keeps pipeline refactors from silently changing accepted art.

The accepted projection mode is intentionally part of curation: grass seals affine
boundary misses; dirt, stone, pebble, sand, and water retain their current unsealed top
pixels. Normalizing those families requires a separately reviewed art change.

For a one-off top projection during curation:

```powershell
python frontend/scripts/project-tile-surface.py <flat-material.png> <out-top.png>
```

That helper emits only a top layer.

## Build side and edge sources

`build-edge-tiles.py` starts from each family's explicit base side and writes the five
land-family frayed masks to the build-source directory:

```powershell
python frontend/scripts/build-edge-tiles.py
```

`build-rich-edges.py` projects generated slab materials through those masks and emits
only numbered runtime side layers:

```powershell
python frontend/scripts/build-rich-edges.py
```

Continuous cliff murals use the same build-source mask and likewise emit only side
layers:

```powershell
python frontend/scripts/build-mural-edges.py `
  <mural.png> `
  docs/art/tile-concepts/edge-masks/<family>-edge-side.png `
  frontend/public/assets/tiles/surface `
  <prefix> <window-count> [start-index]
```

The board supplies the cell's own top above every rich or mural side. Edge builders must
not copy that top or create catalog-only combined sprites.

## Production scripts

- `build-surface-tiles.py` — generated flat material + explicit side/underlay sources →
  base top and side runtime layers; includes the pixel-regression gate.
- `project-tile-surface.py` — standalone flat square → top-layer projection.
- `build-edge-tiles.py` — explicit base side → frayed build-source mask.
- `build-rich-edges.py` — generated slab material + frayed mask → numbered side layers.
- `build-mural-edges.py` — generated mural + frayed mask → ordered side-layer windows.
- `tile-contact-sheet.py` — curation contact sheet for generated top-material pools.

There is no split, combined-sprite repair, or whole-tile angle-correction phase. Those
were migration tools for the retired combined representation and have been deleted.
