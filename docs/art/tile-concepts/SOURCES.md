# Tile source assets — recovery pointer

The committed terrain tiles in `frontend/public/assets/tiles/textured/*.png` are **Blender
renders**. This file is the recoverable source of truth for *how they are made*: the exact
inputs, the per-tile recipe, and where the (large, third-party) source bytes live. The bytes
themselves are not committed — they are oversized PBR/photo packs (~550 MB full, ~4K maps for
96-px tiles) under a license-pending status — so git holds this pointer + the render recipe
instead.

## Where the bytes live

- **Azure Blob — canonical, off-machine recovery:** subscription `romaine-life`, resource
  group `chess-tactics-sources`, storage account `chesstacticssrc`, **private** container
  `tile-sources` (public blob access disabled — these are license-pending source packs, not
  browser-delivered like BGM). Holds the full archive: `tiles_ex/` (originals) + `_drivers/`
  (the render recipe). Recover with an authorized `az login`, then:
  `az storage blob download-batch --account-name chesstacticssrc -s tile-sources -d <dir>`
- **Local mirror:** `D:\repos\chess-tactics-asset-sources\` (rescued out of `%TEMP%`).

> Infra note: the RG/account/container above were created directly (not via `tofu/storage.tf`,
> whose `chesstacticsmedia` BGM account is a separate, not-yet-applied resource — kept distinct
> on purpose so neither apply collides). Fold these into tofu and `import` them on the next
> infra pass so the archive store is IaC-tracked.

## Render recipe

- Script: [`render_tile_3d.py`](render_tile_3d.py) — builds an iso block, textures top/side,
  adds mode-specific 3D detail, renders 96×180 with a transparent film.
- Driver: [`recipe/batch_tiles3d.sh`](recipe/) — the original per-tile invocations (rescued
  from TEMP). **Note:** it references `$TEMP/tile3d.py` and a dead worktree path; the committed
  `render_tile_3d.py` is the newer canonical script. `render_tile_3d.py` also hardcodes the
  grass-blade OBJ to `%TEMP%/tiles_ex/grass-02/inner/`; re-pointing that at the archive is
  required before a clean re-render.
- Invocation: `blender -b --python render_tile_3d.py -- <mode> <out.png> <basecolor> <packdir> <seed>`

## Per-tile inputs

| Tile | Mode | Basecolor (pack-relative) | Pack | Seed |
|------|------|---------------------------|------|------|
| grass-a..f | grass | `grass/textures/Tile_{1_0,2_0,3_0,1_1,2_1,3_1}.jpg` | grass | 1–6 |
| grass-g | grass | `grass-02/textures/2023-11-27T110445Z.png` | grass-02 | 7 |
| dirt-a | ground | `simple-grass-chunks/textures/ground_close_04_basecolor.jpeg` | simple-grass-chunks | — |
| dirt-b | ground | `simple-grass-chunks/textures/rostlinka_07_ground_albedo.jpeg` | simple-grass-chunks | — |
| dirt-c | ground | `simple-grass-chunks/textures/rostlinka_07c_diffuse.jpeg` | simple-grass-chunks | — |
| dirt-d | ground | `simple-grass-chunks/textures/rostlinka12_2k_difuse.jpeg` | simple-grass-chunks | — |
| stone-a | ground | `grey-stone-tile-texture/textures/Grey_stone_tile_texture__photographed_in_g.jpeg` | grey-stone-tile-texture | — |
| stone-b | ground | `old-stone-tile-with-displacement/textures/TiledMat_Base_Color.png` | old-stone-tile-with-displacement | — |
| stone-c | ground | `overgrown-stone-tiles-tile-texture/textures/OvergrownStoneTiles_basecolor.jpg` | overgrown-stone-tiles-tile-texture | — |
| pebble-a | pebble | `tilable-pabbles-with-mossy-1-3d-model-free/textures/1781700678456_0.png` | tilable-pabbles-with-mossy-1-3d-model-free | — |
| sand-a | ground | `sand-at-sunset-beach/textures/texture0.jpeg` | sand-at-sunset-beach | — |
| water-a | water | `forgotten-sanctuary-lake/textures/Image_0_2.jpeg` | forgotten-sanctuary-lake | — |
| water-b | water | `stream/textures/Hurst - Stream.jpeg` | stream | — |

**Meshes added on top (the doodads):**
- grass blades (all grass tiles): `grass-02/inner/Grass 02.obj` + `grass-02/inner/2023-11-27T110445Z.png`
- pebble field (pebble-a): `tilable-pabbles-with-mossy-1-3d-model-free/source/tilable pabbles wit mossy 1.glb`

`ground`/`water` modes add no mesh; `findmap()` auto-resolves normal/roughness/AO/displacement
maps from each pack's `textures/` dir by filename keyword.

## Provenance / license

All packs are third-party downloads (license-pending — see README). Each pack directory name
above is its identifier; origin URLs were not recorded at download time. Treat as not
redistributable until licensing is cleared.
