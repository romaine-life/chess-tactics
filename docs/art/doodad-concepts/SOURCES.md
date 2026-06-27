# Doodad sources

Doodads are split-layer props (see the `split-layer doodad` glossary entry). Each is
rendered from a CC0 source mesh through the split recipe. The **meshes live outside git**
(large, CC0, re-fetchable) — this table + the fetch script + the recipe are the recoverable
record, per the repo's asset source-of-truth rule (pointer + recipe, not binaries in git).

**Re-fetch a mesh** (into the asset-sources tree, not the repo):

```
node frontend/scripts/fetch-ph-model.mjs <slug> <outDir> [1k]
```

**Render the halves** (drops straight into `<DoodadSprite>`):

```
blender -b -P docs/art/doodad-concepts/render_doodad_gltf.py -- <out.png> <gltf> <scale> <back|front>
```

`scale` is the prop's largest dimension in Blender units; the recipe stands the mesh up,
grounds the foot to the (48,69) contact pixel, and renders the 96x180 sprite. ~0.46 keeps a
prop inside the frame's ~69px of headroom above the foot.

| doodad id  | terrain | source            | provider          | license | scale |
|------------|---------|-------------------|-------------------|---------|-------|
| boulder    | stone   | `boulder_01`      | Poly Haven        | CC0     | 0.46  |
| stump      | dirt    | `tree_stump_01`   | Poly Haven        | CC0     | 0.46  |
| fern       | water   | `fern_02`         | Poly Haven        | CC0     | 0.46  |
| flower     | grass   | `flower_gazania`  | Poly Haven        | CC0     | 0.46  |

`grass-tuft` predates this recipe — rendered from the `grass-02` OBJ via the original
`render_doodad.py` (grass-specific import + scatter).
