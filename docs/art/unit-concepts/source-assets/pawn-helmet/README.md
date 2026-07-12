# Helmeted Pawn (source)

Private source-version identities for the active pawn design. Accepted frames
live in Unit Art; local render output is temporary and ignored.

- Backend `sourcePath` `docs/art/unit-concepts/source-assets/pawn-helmet/Pawn.stl`
  identifies the private classic Staunton pawn source (from `chess-pawn.zip`).
- Backend `sourcePath` `docs/art/unit-concepts/source-assets/pawn-helmet/helmet.dae`
  identifies the private medieval archer's helmet COLLADA source (from
  `helmet-archery.zip`). Its PBR
  textures (albedo/normal/metallic/roughness/AO) are intentionally **not** included — the
  pipeline strips them and navy-styles the geometry to match the roster.
- **Production status:** source/reference only until license and origin are confirmed.

`scripts/generate-unit-art.py` fetches both exact versions into an OS temporary
directory from an outside-repository source manifest, then runs the Git-owned
`docs/art/unit-concepts/blender-units/pawn-helmet/render_pawn_helmet.py`
algorithm (Blender 5.x has no COLLADA importer, so it hand-parses the private
`.dae` positions/triangles).
