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

## Multi-cell props (trees, houses)

Props (`frontend/src/core/props.ts`) occupy a W×H block and render as ONE un-sliced stand-up
sprite via `<PropSprite>` (`frontend/src/render/BoardStructure.tsx`). Same iso rig as a doodad,
re-framed for the bigger footprint: a **192×300** frame with the ground-contact pixel at
**(96, 255)** (centred horizontally, 45px up from the bottom). The seat math keeps px/unit equal
to the 1×1 doodad (180px / 1.31u), so a 2×2 prop reads at true relative scale. The renderer reads
frame size + anchor from `def.sprite` and seats the contact pixel with `translate(-(anchorX/w)%,
-(anchorY/h)%)`.

**Render the halves** (drops straight into `<PropSprite>`):

```
# from a CC0 glTF (most trees are already Z-up -> ROT=none; ground props lying Y-up -> x90):
blender -b -P docs/art/doodad-concepts/render_prop_gltf.py -- <out.png> <gltf> <scale~1.95> <back|front> <none|x90|x-90|autoz>
# procedural placeholder (no mesh needed), e.g. while sourcing final art:
blender -b -P docs/art/doodad-concepts/render_prop_placeholder.py -- <out.png> <tree|house> <back|front>
```

Output `/assets/props/<propId>/{back,front}.png`.

| prop id | kind  | footprint | source            | provider   | license | scale | rot  | notes |
|---------|-------|-----------|-------------------|------------|---------|-------|------|-------|
| oak     | tree  | 2×2       | `island_tree_01`  | Poly Haven | CC0     | 1.95  | none | broadleaf w/ thick trunk; alt candidates `tree_small_02`, `jacaranda_tree` |
| cottage | house | 2×2       | procedural        | (this repo)| —       | 1.55  | —    | placeholder cottage from `render_prop_placeholder.py`; Poly Haven has no rustic house — final art is a sourcing decision (Kenney/Quaternius CC0 game kits, or realistic to match the tree) |

Fences are NOT props — they are an edge-autotile feature (`featureAutotile.ts`, kind `fence`),
visual-only in v1; the brush is gated until a 16-mask wood/stone set is baked (via the feature-tile
pipeline, not this recipe).
