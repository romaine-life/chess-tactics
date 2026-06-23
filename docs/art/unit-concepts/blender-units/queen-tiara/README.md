# Tiaraed Queen (source)

Source for the active queen unit (`frontend/public/assets/units/queen/blender-render-tiara/`).

- `queen_tiara.blend` — the **hand-assembled** source of truth: a navy Staunton queen
  (chess queen, axis-baked + normalized + navy-styled) wearing a jeweled gold **tiara**
  (FBX with PBR maps: albedo/metallic/roughness/normal) **hand-fitted** onto the crown
  collar in Blender. Because the tiara was seated interactively (not scripted), this
  `.blend` *is* the recipe.
- `render_queen_tiara.py` — opens the `.blend` and renders the 8 true-isometric
  directions + prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the queen geometry
came from a Staunton chess queen `.blend` and the tiara from a downloaded "princess crown /
tiara" FBX. Raw downloads are not committed; the assembled `.blend` carries the geometry
actually used. Confirm license before shipping.

Calibration (matches the standard rig): canvas 512px, contact footprint **150px**,
seating anchor **50% / 80.241%**. Unlike the rotationally-symmetric king, the tiara's
front gives the queen a genuine per-direction facing across the 8 sprites.
