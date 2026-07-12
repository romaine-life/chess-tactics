# Crowned King (source)

Source for the active king design. Renders go to `.unit-art-output/king/navy-blue/`
before upload through Unit Art.

- `king_crown.blend` — the **hand-assembled** source of truth: a navy Staunton king
  (wooden chess king OBJ, axis-baked + normalized + navy-styled) with a gold/jewel
  **crown** (Sketchfab FBX, PBR textures) **hand-fitted** onto the head in Blender.
  Because the crown was placed interactively (not scripted), this `.blend` *is* the recipe.
- `render_king_crown.py` — opens the `.blend` and renders the 8 true-isometric directions
  + prints the seating anchor.

**Source models (license-pending, per the wooden-knight precedent):** the king geometry
came from a wooden Staunton king OBJ (`WoodenChessKingSideB…`) and the crown from a
Sketchfab "King's Crown" FBX (`kings-crown-4k-and-2k`). Raw downloads are not committed;
the assembled `.blend` carries the geometry actually used. Confirm license before shipping.

The king + crown are rotationally symmetric — the 8 direction sprites are near-identical.
