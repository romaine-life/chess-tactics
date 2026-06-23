# Mitred Bishop (source)

Source for the active bishop unit (`frontend/public/assets/units/bishop/blender-render-mitre/`).

- `bishop_mitre.blend` — the **hand-assembled** source of truth: a navy Staunton bishop
  (chess bishop FBX, axis-baked + normalized + navy-styled) wearing a **mitre**
  (OBJ, navy stone material) **hand-fitted** onto the head in Blender. Because the
  mitre was seated interactively (not scripted), this `.blend` *is* the recipe.
- `render_bishop_mitre.py` — opens the `.blend` and renders the 8 true-isometric
  directions + prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the bishop geometry
came from a Staunton chess bishop FBX and the mitre from a downloaded mitre OBJ. Raw
downloads are not committed; the assembled `.blend` carries the geometry actually used.
Confirm license before shipping.

Calibration (matches the standard rig): canvas 512px, contact footprint **158px**,
seating anchor **50% / 80.241%**. Unlike the rotationally-symmetric king, the mitre's
front peak gives the bishop a genuine per-direction facing across the 8 sprites.
