# Wall Concept Sources

Wall sprites follow ADR-0040: deterministic geometry is allowed to own the
isometric footprint, but the visible material must come from generated/source art.

## Active Bake

- Source staging: `walls/photoscanned-old-stone-wall-2x4m.zip`
- Run record: `docs/art/wall-concepts/runs/wall-material-runs-2026-07-06.json`
- Canonical full-height contact sheet: `docs/art/wall-concepts/wall-bake-contact-sheet.png`
- Current baked materials:
  - `stone` — photoscanned wall texture, runtime-diamond geometry bake
  - `brick` — Codex img2img material, runtime-diamond geometry bake
  - `mossy` — PixelLab material, runtime-diamond geometry bake
  - `basalt` — PixelLab material, runtime-diamond geometry bake
  - `palisade` — PixelLab material, runtime-diamond geometry bake
- Current baked assets:
  - `frontend/public/assets/tiles/feature/wall-<material>-1.png`
  - `frontend/public/assets/tiles/feature/wall-<material>-8.png`
  - `frontend/public/assets/tiles/feature/wall-<material>-9.png`
  - `frontend/public/assets/tiles/feature/wall-<material>-thumb.png`
- Runtime tile proof renders:
  - `docs/art/wall-concepts/proofs/wall-<material>-proof.png`
- Runtime seat proof renders:
  - `docs/art/wall-concepts/proofs/wall-<material>-runtime-seat-proof.png`
- Script: `frontend/scripts/build-wall-tiles.py`
- Command:

```powershell
python frontend/scripts/build-wall-tiles.py
```

The script prepares material images, projects them into the exact shipped tile
back-edge geometry, writes canonical 128x336 wall frames, composites proofs against the
shipped grass tile, then crops square palette thumbnails. Runtime seats every wall at
anchor `(64,192)`. The full-height frame has wall height 160 and
back-edge base `(16,191) -> (64,164) -> (112,191)`. Relative to its anchor, that base
retains the established board-space geometry: endpoints at
`y=-1`, apex at `y=-28`, and x positions 16/64/112. Only the top grows upward; logical
wall plane, contact footprint, masks, materials, shading, and below-anchor tail remain
unchanged. The upward headroom contains the grounded Grand Gallery at runtime slot
`y=72`; the 142x240 face canvas begins 16px below the wall canvas top while the lower
rail reaches the wall/floor datum.

The former 128x240/anchor `(64,96)` short bake and parallel `wall-tall-*` mirror-only
outputs are retired. The full-height pixels now occupy the canonical `wall-*` runtime
filenames for bare, decorated, and mirror-bearing walls alike, per
[ADR-0086](../../adr/0086-all-perimeter-walls-use-full-height-geometry.md).

Gameplay/editor placement is narrower than the baked masks: walls are authored
only on the board's northmost and westmost perimeter edges. Interior, south, and
east edges are ignored and are dropped on save.

## Three-Lane Bake-Off Shape

- Photoscan lane: the staged photoscan supplies generated/source material; the
  runtime tile diamond owns the N/W masks and seating.
- Codex img2img lane: `frontend/scripts/forge-wall-material.mjs` generates a
  method-gated flat material from the photoscan reference; the wall bake projects
  it into the same runtime-diamond wall geometry. This is active for `brick`.
- PixelLab lane: PixelLab `create_tiles_pro` generates flat material candidates;
  selected candidates are archived and then projected into the same
  runtime-diamond wall geometry. This is active for `mossy`, `basalt`, and
  `palisade`.

No PixelLab or img2img output is treated as the final isometric authority. Those
tools generate material only; the shipped tile diamond owns the wall angle, mask
frame, and tile seating proof.
