# Tile Asset Roadmap

This is the current working plan for production board terrain. The durable rules live in
`docs/tile-ruleset.md`, `docs/board-render-contract.md`, and ADR-0075.

## Current production baseline

- Six base families: grass, dirt, stone, pebble, sand, water.
- Eight top variants and eight palette-tied side variants per family.
- Native frame: 96x180; top diamond vertices `(48,41) (96,68) (48,95) (0,68)`.
- Stable gameplay IDs such as `grass-surf-0`; image paths are registry data, not level data.
- Every base record declares `topSrc` and `sideSrc` explicitly.
- Water records additionally declare an eight-frame `topAnimSrc` sheet.
- Perimeter rich edges, continuity murals, and story features are side-only assets.
- Browser gameplay, the Level Editor, Studio boards, and server thumbnails use the same
  registered layers.

The old whole-tile PixelLab/Blender QA sets, combined production sprites, virtual basename
registry, split pass, and combined preview fallback are retired. Recovery details are in
`docs/art/tile-concepts/SOURCES.md`.

## Production workflow

1. Generate a flat top-down material pool under
   `docs/art/pixellab-runs/surfaces/<family>/`.
2. Curate the pool in an owner-visible contact sheet and board preview.
3. Run `frontend/scripts/build-surface-tiles.py`. It projects the selected material into
   the canonical top diamond and writes `-top.png` and `-side.png` directly from the
   committed side-only template.
4. Run the tile-layer asset guard and the normal frontend check.
5. Review the actual board at the dynamic Vite Studio URL. Judge the top in board context
   and the side in the dedicated Tile Sides viewer; do not use a flattened proxy.

## Next art work: terrain transitions

Transitions remain pair-local and socket-driven. Grass-Water, Grass-Stone, and Stone-Water
each have fourteen mixed masks (`0001` through `1110`). The generator and review process
must receive top-only production references for both materials; a combined cube is never an
input to a transition-top experiment. Side treatment is an independent later gate.

For each transition candidate:

- preserve the canonical top diamond and edge sockets;
- record pair, mask, tool/run, source top IDs, and provenance;
- show the result on the real shared board renderer;
- report missing art separately from illegal sockets;
- require owner acceptance before entering the production registry.

Tile placement policy is outside the art asset: the editor may temporarily allow illegal
placement, while generation/save validation can enforce sockets separately.

## Acceptance gates

- Exact 96x180 layer frames; integer placement; no fractional downscale.
- Base top and side hard-alpha regions are disjoint. Approved side-only rubble shadows
  may use partial alpha, but remain outside the top-owned region.
- No generated material is recreated with code-painted RGB/CSS.
- No combined 1x1 tile, filename-derived layer, compatibility fallback, or retired QA route.
- Board-scale readability and artistic acceptance are human gates after mechanical checks.
