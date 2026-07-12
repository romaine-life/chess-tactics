# Doodad sources

Doodads are split-layer props (see the `split-layer doodad` glossary entry). Each is
rendered from a CC0 source mesh through the split recipe. Exact mesh and texture bytes are
private archived live-media versions: Postgres owns their source paths/provenance and the
backend object store owns their hashes. The provider table and recipe in Git are useful
text provenance, but they are not a substitute for archiving the bytes actually rendered.

**Archive a provider model** (no durable local source tree is written):

```
node frontend/scripts/fetch-ph-model.mjs <slug> --api-base <backend> [--resolution 1k]
```

**Fetch an exact archived source into an OS temporary render workspace:**

```
node frontend/scripts/live-media-admin-client.mjs fetch-source \
  --api-base <backend> \
  --source-path providers/polyhaven/<slug>/<file> \
  --domain prop \
  --out <os-temp>/<slug>/<file>
```

**Render the halves** into that temporary workspace, then upload each output as a
candidate for its canonical semantic slot (rendering never writes runtime pixels to Git):

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
   node frontend/scripts/forge-prop-restyle.mjs <capture.png> [attempts] -- \
     --api-base <backend> --cookie <cookie> --slot <slot> \
     --domain prop --role sprite --label <label>
   ```
   This goes through `codex-imagegen.mjs` → `imageGenVerdict` (rollout `image_generation_call`), so a
   code-drawn run is REJECTED (never call `codex.exe` raw). The command uses an OS-temporary
   workspace, converts flat green to alpha, and uploads the result directly as a non-active live
   candidate; it does not write an output or bridge into Git. Any crop, resample, or anchor-tuning
   pass remains calibration work under
   [ADR-0076](../../adr/0076-scaling-is-calibration-production-art-is-native-1x.md), not accepted
   production art. Regenerate at the approved native footprint before acceptance.

Canonical output slots are `/assets/props/<propId>/{back,front}.png` (flat sprites use the
same image for both halves). The URL is backend-resolved; it is not a repository path.

| prop id | kind  | footprint | pipeline | source mesh (CC0) | notes |
|---------|-------|-----------|----------|-------------------|-------|
| oak     | tree  | 2×2       | Blender render (glTF) | `island_tree_01` (Poly Haven) | **NOT READY** — still photoreal; needs the Codex restyle to match the stylized houses |
| cottage | house | 2×2       | low-poly mesh render | `lowvpoly stylized home` (user-supplied `/houses`) | stylized as-is |
| cabin   | house | 2×2       | Codex restyle of capture | `forest-loner` `house_final.fbx` (user-supplied) | photoreal cabin → pixel-art restyle |
| lodge   | house | 2×2       | Codex restyle of capture | `forest-house` `nice_house.blend` (user-supplied) | photoreal green-roof → pixel-art restyle |
| rock    | rock  | 1×1       | Codex restyle of capture | `boulder-rock-3d-model-free` `Meshy_AI_Layered_Mossy_Boulder…glb` (user-supplied `/rocks`) | 1×1 blocking obstacle — the placeable rock (mossy layered). 40px native @ `scale 1` baseline |
| fieldstone | rock | 1×1     | Codex restyle of capture | `lone-granite-boulder-stone` `round-boulder.fbx` (user-supplied `/rocks`) | 1×1 blocking obstacle — round weathered boulder. 51px native @ `scale 1` baseline. NOT named `granite`: that id is the obstacle-piece sprite variant (`/assets/units/rock/granite/`), a separate system |

Historically, house and rock source archives arrived in repo-root staging folders outside Git.
That workflow is retired: any surviving staging archive must be uploaded as a private source
version, hash-verified through the backend, and removed before use. 1×1 props must FIT WITHIN
THEIR TILE (owner call, 2026-07-02):
the base sits inside the 96px cell diamond with margin.

Sizing baseline (owner call, 2026-07-03): a small 1×1 prop is baked at ~its on-board size so its
NATURAL `scale: 1` IS the intended size — the scale slider then centers on 1× and you tune ± from a
sane baseline, and the sprite renders crisp 1:1. `rock` is 40px native @ `scale 1` and `fieldstone` 51px @ `scale 1`. (This differs from big props
like `cabin`/`cottage`, which ship large and shrink via a fractional `scale` so they stay detailed
when scaled up. ADR-0076 now classifies those large, live-shrunk sprites as legacy calibration
bridges: retain the tuned footprint as the regeneration brief, but do not call them accepted until
native replacements render at asset-local scale `1`.)

Fences are NOT props — they are gameplay-blocking, edge-keyed barriers resolved by
`featureAutotile.ts`. Runtime art uses three deterministic E/S rail masks plus generated
automatic or author-placed vertex-post sprites for wood and stone. The active sources, topology, proofs, and bake
are described in `docs/art/fence-concepts/SOURCES.md`; their pixels, proofs, and lifecycle live
in the backend catalog rather than that documentation tree.
