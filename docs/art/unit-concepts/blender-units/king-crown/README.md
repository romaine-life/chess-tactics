# Crowned King (source)

Provenance for the active king design. Accepted frames live in Unit Art; any
`.unit-art-output` directory is an ignored temporary render workspace.

- Backend `sourcePath`
  `docs/art/unit-concepts/blender-units/king-crown/king_crown.blend` identifies
  the private content-addressed **hand-assembled** material source: a navy Staunton king
  (wooden chess king OBJ, axis-baked + normalized + navy-styled) with a gold/jewel
  **crown** (Sketchfab FBX, PBR textures) **hand-fitted** onto the head in Blender.
  Because the crown was placed interactively (not scripted), that private
  `.blend` version carries the assembly. It is not a repository file.
- `render_king_crown.py` is Git-owned code. The canonical generator fetches the
  private source into an OS temporary directory, opens it, renders the 8
  true-isometric directions, and prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the king geometry
came from a wooden Staunton king OBJ (`WoodenChessKingSideB…`) and the crown from a
Sketchfab "King's Crown" FBX (`kings-crown-4k-and-2k`). Raw downloads are not committed;
the private assembled `.blend` version carries the geometry actually used. Confirm license before shipping.

The king + crown are rotationally symmetric — the 8 direction sprites are near-identical.
