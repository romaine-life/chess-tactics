# Tile source assets and retired-art recovery

Production 1x1 terrain is layer-native (ADR-0075). Git stores only the explicit runtime
top/side assets and the source material needed to rebuild them.

## Current committed build sources

- Flat top-down generated materials:
  `docs/art/pixellab-runs/surfaces/<family>/tile_<index>.png`.
- Side-only production templates:
  `docs/art/tile-concepts/side-templates/<family>-side.png`.
- Top-only seam underlays:
  `docs/art/tile-concepts/top-underlays/<family>-top-underlay.png`.
- Frayed edge geometry masks:
  `docs/art/tile-concepts/edge-masks/<family>-edge-side.png`.
- Generated rich-side and mural material:
  `frontend/public/assets/tiles/explore/`.

The former combined build input was split losslessly into a side template (outside-diamond
RGBA) and top underlay (inside-diamond RGBA). The builder may compose those source layers
in memory so an affine projection miss reveals the already-accepted seam pixel, but it emits
only the explicit runtime top and side. The old whole blocks are archived below; they are
not runtime assets or runnable production inputs.

## Retired migration archives

Before removal, every retired tracked file was archived from source commit
`8c1d30286066150b2a2458fedf9ec9c224619620`. The canonical archive inventory is
three ZIP/manifest pairs: 207 PNGs plus 17 retired source files.

Shared destination:

- Azure subscription: `romaine-life`
- storage account: `chesstacticssrc`
- private container: `tile-sources`
- prefix:
  `retired/tile-layer-migration/2026-07-10/8c1d30286066150b2a2458fedf9ec9c224619620/`

Primary legacy-art bundle:

- ZIP: `git-tile-layer-legacy-8c1d3028.zip`
- ZIP SHA-256: `bc084847ac4c2465e3388bf6c5e3b1454a504bb117b4a1b6f6ac9398de972c6b`
- manifest: `git-tile-layer-legacy-8c1d3028.manifest.json`
- manifest SHA-256: `6bc4e731027b00669e621ec107916a564a1f99b577fa2ae2a8f80560afb42a65`
- inventory: 202 PNGs, 1,862,146 source bytes.

Supplemental retired public edge-side bundle (the five painted predecessors of the new
geometry-only source masks):

- ZIP: `git-tile-layer-retired-edge-masks-8c1d3028.zip`
- ZIP SHA-256: `cdd585cf601b8d85fbbced9095817c15005598d167fe0dde81e0ce2e8b2912ff`
- manifest: `git-tile-layer-retired-edge-masks-8c1d3028.manifest.json`
- manifest SHA-256: `4bc2a3ea51df88b516d7fb9f205262bcad16fa9721fad16a99fcc93c8fcbefab`
- inventory: 5 PNGs, 77,248 source bytes.

Retired whole-tile source/QA bundle:

- ZIP: `git-tile-layer-retired-source-8c1d3028-v3.zip`
- ZIP SHA-256: `39131185c6fa02b4b7deefe466fd52e731a285af110f5bbde0ecbdf1a018e9bb`
- manifest: `git-tile-layer-retired-source-8c1d3028-v3.manifest.json`
- manifest SHA-256: `b51060f34d627c3ef99bf56d6e4c98d6915b6bce2805aa27f113eeded69e7630`
- inventory: 17 files, 70,345 source bytes. These are the deleted whole-tile drivers,
  split/repair scripts, retired comparison registry, and retired comparison UI.

All six blobs are stored on Cool tier. Each pair was downloaded into a fresh directory
after upload. ZIP and manifest hashes matched; all 207 extracted PNGs matched recorded
byte lengths, SHA-256, and Git object IDs, and all 17 extracted source files matched their
recorded byte lengths and Git object IDs. The two rejected line-ending-normalized source
blobs from the first packaging attempt were deleted, leaving only this byte-exact `v3`
source pair.

Recover with an authorized Azure CLI session, for example:

```sh
az storage blob download-batch \
  --subscription romaine-life \
  --account-name chesstacticssrc \
  --source tile-sources \
  --destination <directory> \
  --pattern 'retired/tile-layer-migration/2026-07-10/8c1d30286066150b2a2458fedf9ec9c224619620/*'
```

## Original third-party source packs

The same private container retains the pre-existing `tiles_ex/` source packs and
`_drivers/` recovery snapshot. A local mirror may exist at
`D:\repos\chess-tactics-asset-sources\`. Those source packs remain license-pending and
must not be redistributed. The obsolete whole-tile drivers are recovery material only;
they are not committed or used by the current build.
