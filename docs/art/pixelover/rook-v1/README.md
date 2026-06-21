# PixelOver Rook V1

This folder is the handoff point for the first PixelOver rook pass.

## Open In PixelOver

Use `input/accepted-rook-south-concept.png` as the main test image.

Reference options:
- `input/accepted-rook-style-ref-256.png` - PixelLab-safe copy of the accepted concept
- `input/pixellab-rook-south.png` - small transparent PixelLab sprite
- `input/blender-rook-south.png` - controlled-rotation render

## Save Project

The checked-in template copy is:

`project/rook-v1.pixelover`

The generated project copy with workspace-local paths/export target is:

`project/rook-v1-generated.pixelover`

If PixelOver offers shader/preset export, save it here too:

`project/rook-v1.poshader`

## Export

Export the test result here:

`export/rook-south.png`

Use transparent PNG. Keep the sprite centered with padding; do not crop tight.

## Regenerate Project

From the repo root:

```sh
node frontend/scripts/prepare-pixelover-project.mjs \
  --template docs/art/pixelover/rook-v1/project/rook-v1.pixelover \
  --image docs/art/pixelover/rook-v1/input/accepted-rook-style-ref-256.png \
  --out docs/art/pixelover/rook-v1/project/rook-v1-generated.pixelover \
  --export docs/art/pixelover/rook-v1/export/rook-south.png \
  --name rook-south
```

The script updates the PixelOver location, source image path, embedded image
bytes, object names, and export path.
