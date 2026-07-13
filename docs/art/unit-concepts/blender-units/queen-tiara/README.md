# Tiaraed Queen (source)

Provenance for the active queen design. Accepted frames live in Unit Art; any
`.unit-art-output` directory is an ignored temporary render workspace.

- Backend `sourcePath`
  `docs/art/unit-concepts/blender-units/queen-tiara/queen_tiara.blend` identifies
  the private content-addressed **hand-assembled** material source: a navy Staunton queen
  (chess queen, axis-baked + normalized + navy-styled) wearing a jeweled gold **tiara**
  (FBX with PBR maps: albedo/metallic/roughness/normal) **hand-fitted** onto the crown
  collar in Blender. Because the tiara was seated interactively (not scripted),
  that private `.blend` version carries the assembly. It is not a repository file.
- `render_queen_tiara.py` is Git-owned code. The canonical generator fetches the
  private source into an OS temporary directory, opens it, renders the 8
  true-isometric directions, and prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the queen geometry
came from a Staunton chess queen `.blend` and the tiara from a downloaded "princess crown /
tiara" FBX. Raw downloads are not committed; the private assembled `.blend`
version carries the geometry actually used. Confirm license before shipping.

Calibration (matches the standard rig): canvas 512px, contact footprint **150px**,
seating anchor **50% / 80.241%**. Unlike the rotationally-symmetric king, the tiara's
front gives the queen a genuine per-direction facing across the 8 sprites.
