# Wall Art Concept Sources

Wall art source sprites are separate transparent assets mounted on wall art in the
Studio preview. They are not wall material variants and do not change the wall
geometry bake.

## Active Set

- Run record: `docs/art/wall-art-concepts/runs/wall-decor-runs-2026-07-06.json`
- Contact sheet: `docs/art/wall-art-concepts/wall-decor-contact-sheet.png`
- Runtime proof: `docs/art/wall-art-concepts/proofs/wall-decor-runtime-proof.png`
- Runtime assets:
  - `frontend/public/assets/wall-decor/banner-tattered.png`
  - `frontend/public/assets/wall-decor/banner-tattered-west.png`
  - `frontend/public/assets/wall-decor/banner-tattered-north.png`
  - `frontend/public/assets/wall-decor/relief-pawn.png`
  - `frontend/public/assets/wall-decor/relief-pawn-west.png`
  - `frontend/public/assets/wall-decor/relief-pawn-north.png`
  - `frontend/public/assets/wall-decor/relief-rook.png`
  - `frontend/public/assets/wall-decor/relief-rook-west.png`
  - `frontend/public/assets/wall-decor/relief-rook-north.png`
  - `frontend/public/assets/wall-decor/lantern-brass.png`
  - `frontend/public/assets/wall-decor/lantern-brass-west.png`
  - `frontend/public/assets/wall-decor/lantern-brass-north.png`
- Runtime manifest: `frontend/public/assets/wall-decor/manifest.json`
- UI catalog manifest: `frontend/src/ui/design/wallDecorManifest.json`

## Pipeline

1. PixelLab `create_tiles_pro` produced wall-art reference strips for flag and
   relief motifs. Those outputs are archived under
   `docs/art/wall-art-concepts/pixellab/`.
2. Codex img2img generated standalone wall-mounted sprites from the references.
   The forge script verifies `image_generation_call` in the Codex rollout and
   removes the chroma-key background:

```powershell
node frontend/scripts/forge-wall-decor.mjs
```

3. The build script trims and frames the transparent sources into stable runtime
   PNGs, projects each sprite onto the west and north wall-face slopes, writes
   `manifest.json`, and creates proof/contact sheets:

```powershell
python frontend/scripts/build-wall-decor.py
```

The game catalog previews both face variants over a wall sample for review, but
runtime placement should choose either the `west` or `north` face entry for a
single wall segment. The assets remain independent transparent sprites. Future
placement can mount them by the chosen face's `mountX` / `mountY` from the
manifest without rebaking wall materials.
