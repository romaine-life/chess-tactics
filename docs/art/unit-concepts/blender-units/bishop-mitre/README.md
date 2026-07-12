# Mitred Bishop (source)

Provenance for the active bishop design. Accepted frames live in Unit Art; any
`.unit-art-output` directory is an ignored temporary render workspace.

- Backend `sourcePath`
  `docs/art/unit-concepts/blender-units/bishop-mitre/bishop_mitre.blend` identifies
  the private content-addressed **hand-assembled** material source: a navy Staunton bishop
  (chess bishop FBX, axis-baked + normalized + navy-styled) wearing a **mitre**
  (OBJ, navy stone material) **hand-fitted** onto the head in Blender. Because the
  mitre was seated interactively (not scripted), that private `.blend` version
  carries the assembly. It is not a repository file.
- `render_bishop_mitre.py` is Git-owned code. The canonical generator fetches
  the private source into an OS temporary directory, opens it, renders the 8
  true-isometric directions, and prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the bishop geometry
came from a Staunton chess bishop FBX and the mitre from a downloaded mitre OBJ. Raw
downloads are not committed; the private assembled `.blend` version carries the geometry actually used.
Confirm license before shipping.

Calibration (matches the standard rig): canvas 512px, contact footprint **158px**,
seating anchor **50% / 80.241%**. Unlike the rotationally-symmetric king, the mitre's
front peak gives the bishop a genuine per-direction facing across the 8 sprites.
