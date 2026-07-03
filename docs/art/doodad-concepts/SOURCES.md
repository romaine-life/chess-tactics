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
sprite via `<PropSprite>` (`frontend/src/render/BoardStructure.tsx`). Each prop carries its OWN
`sprite` frame (`{w,h,anchorX,anchorY}`) — measured per image, not a fixed canvas — and the
renderer seats the ground-contact pixel with `translate(-(anchorX/w)%, -(anchorY/h)%)`. px/unit is
held at the 1×1-doodad rig (137.4) so every prop reads at true relative scale.

House art is STYLIZED, never photoreal (he reads scanned-mesh renders as "too realistic" — see the
`stylized-over-photoreal-props` memory). Two pipelines:

1. **Low-poly stylized mesh → Blender render** (e.g. `cottage`). Render uncut into a generous frame,
   then crop-to-content + measure the foot anchor (PIL `alpha.getbbox()`):
   ```
   # scales by horizontal FOOTPRINT (not largest-dim, which clipped boxy houses); handles
   # .blend (open it) / .fbx / .obj / .gltf; relinks + auto-wires textures from <texdir>:
   blender [scene.blend] -b -P docs/art/doodad-concepts/render_prop_mesh.py -- \
     <out.png> <none|mesh.fbx|.obj|.gltf> <footprint~1.1> full <none|x90|autoz> <texdir> <FW> <FH> [TZ]
   # then: crop to alpha bbox + ~10px margin, anchor = (bbox center-x, bbox bottom). Set def.sprite.
   ```
2. **Photoreal mesh → gated Codex RESTYLE** (e.g. `cabin`, `lodge`). Keep the real shape/iso, re-skin
   to pixel-art. Render a Blender capture as above, then:
   ```
   node frontend/scripts/forge-prop-restyle.mjs <capture.png> <out.png>
   ```
   This goes through `codex-imagegen.mjs` → `imageGenVerdict` (rollout `image_generation_call`), so a
   code-drawn run is REJECTED (never call `codex.exe` raw). Output is flat-green → chroma-keyed to
   alpha; then crop-to-content + downscale to ~210px wide + re-binarise alpha + measure anchor.

Output `/assets/props/<propId>/{back,front}.png` (flat sprites use the same image for both halves).

| prop id | kind  | footprint | pipeline | source mesh (CC0) | notes |
|---------|-------|-----------|----------|-------------------|-------|
| oak     | tree  | 2×2       | Blender render (glTF) | `island_tree_01` (Poly Haven) | **NOT READY** — still photoreal; needs the Codex restyle to match the stylized houses |
| cottage | house | 2×2       | low-poly mesh render | `lowvpoly stylized home` (user-supplied `/houses`) | stylized as-is |
| cabin   | house | 2×2       | Codex restyle of capture | `forest-loner` `house_final.fbx` (user-supplied) | photoreal cabin → pixel-art restyle |
| lodge   | house | 2×2       | Codex restyle of capture | `forest-house` `nice_house.blend` (user-supplied) | photoreal green-roof → pixel-art restyle |
| rock    | rock  | 1×1       | Codex restyle of capture | `boulder-rock-3d-model-free` `Meshy_AI_Layered_Mossy_Boulder…glb` (user-supplied `/rocks`) | 1×1 blocking obstacle — the placeable rock (mossy layered) |
| granite | rock  | 1×1       | Codex restyle of capture | `lone-granite-boulder-stone` `round-boulder.fbx` (user-supplied `/rocks`) | 1×1 blocking obstacle — round granite variant |

Source meshes for the houses arrived as zips in the repo-root `houses/` staging folder (outside
git); the 4th, `dae-diorama-forest-loner`, is a `.rar` and needs an extractor. The two rock meshes
arrived the same way in `/rocks`. 1×1 props downscale to ~102px wide (half the 2×2 ~210px
convention — ~10% overhang past the 96px cell diamond).

Fences are NOT props — they are an edge-autotile feature (`featureAutotile.ts`, kind `fence`),
visual-only in v1; the brush is gated until a 16-mask wood/stone set is baked (via the feature-tile
pipeline, not this recipe).
