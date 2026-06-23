# Helmeted Pawn (source)

Source models for the active pawn unit (`frontend/public/assets/units/pawn/blender-render-helmet/`).

- `Pawn.stl` — classic Staunton pawn (from `chess-pawn.zip`).
- `helmet.dae` — medieval archer's helmet, COLLADA (from `helmet-archery.zip`). Its PBR
  textures (albedo/normal/metallic/roughness/AO) are intentionally **not** included — the
  pipeline strips them and navy-styles the geometry to match the roster.
- **Production status:** source/reference only until license and origin are confirmed.

Render recipe: `docs/art/unit-concepts/blender-units/pawn-helmet/render_pawn_helmet.py`
(Blender 5.x has no COLLADA importer, so the recipe hand-parses the `.dae` positions/triangles.)
