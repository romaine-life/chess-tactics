import bpy, math, mathutils, sys, os, re
import numpy as np

def upstream_image_node(input_socket):
    """Find the first image feeding a shader input, including through Mix nodes."""
    if not input_socket:
        return None
    pending = [link.from_node for link in input_socket.links]
    visited = set()
    while pending:
        node = pending.pop(0)
        if node.as_pointer() in visited:
            continue
        visited.add(node.as_pointer())
        if node.type == "TEX_IMAGE" and node.image:
            return node
        for node_input in node.inputs:
            pending.extend(link.from_node for link in node_input.links)
    return None

# Render an AUTHORED mesh (a sourced .blend/.fbx/.obj/.gltf house, NOT code-drawn geometry) into
# the board's PropSprite frame: 192x300, contact GROUND-CENTRE at (96,255), same iso rig as the
# tree. Two entry modes:
#   blender -b -P render_prop_mesh.py -- OUT <mesh.fbx|.obj|.gltf|.glb> SCALE HALF [ROT] \
#     [TEXDIR] [FW] [FH] [TZ] [FACING] [ENGINE] [FRAMING] [FRAMING_SCALE] [FOCUS_HEIGHT] \
#     [OMIT_MATERIALS] [INCLUDE_OBJECTS] [ANIMATION_FRAME] [SOURCE_YAW]                    (imports)
#   blender <scene.blend> -b -P render_prop_mesh.py -- OUT none SCALE HALF [ROT] \
#     [TEXDIR] [FW] [FH] [TZ] [FACING] [ENGINE] [FRAMING] [FRAMING_SCALE] [FOCUS_HEIGHT] \
#     [OMIT_MATERIALS] [INCLUDE_OBJECTS] [ANIMATION_FRAME] [SOURCE_YAW]                    (open scene)
# HALF in {full,front,back}. ROT in {none,x90,x-90,autoz,principal-plane}.
# FACING uses the board's canonical eight direction names, or `all` to render one complete
# turntable into OUT/<direction>.png without re-importing the source eight times. The camera
# remains fixed and the grounded object turns around +Z, exactly like production unit turntables.
# ENGINE is cycles (default) or eevee. FRAMING is contact (default) or source; source framing
# centers and contains the complete turntable subject for floating Artwork/img2img reference use.
# FRAMING_SCALE optionally tightens or loosens that source frame; values below 1 crop peripheral
# geometry. FOCUS_HEIGHT optionally recenters the turntable around geometry above that fraction of
# the subject's height, allowing a central landmark to be isolated from a broad authored base.
# OMIT_MATERIALS is an optional comma-separated material-name list whose assigned faces are removed.
# INCLUDE_OBJECTS is an optional comma-separated exact mesh-object allowlist for source packs.
# ANIMATION_FRAME optionally bakes a rigged source at one deterministic authored frame.
# SOURCE_YAW rotates the complete assembled subject around +Z before the eight-view turntable.
a = sys.argv[sys.argv.index("--") + 1:]
OUT = a[0]
IMPORT = a[1] if len(a) > 1 else "none"
SCALE = float(a[2]) if len(a) > 2 else 1.55
HALF = a[3] if len(a) > 3 else "full"
ROT = a[4] if len(a) > 4 else "none"
TEXDIR = a[5] if len(a) > 5 else ""  # folder to search for missing texture images (relink)
FW = int(a[6]) if len(a) > 6 else 320   # frame width  (generous so the iso projection never clips)
FH = int(a[7]) if len(a) > 7 else 420   # frame height
TZ = float(a[8]) if len(a) > 8 else 0.5
FACING = a[9] if len(a) > 9 else "south"
ENGINE = a[10] if len(a) > 10 else "cycles"
FRAMING = a[11] if len(a) > 11 else "contact"
FRAMING_SCALE = float(a[12]) if len(a) > 12 else 1.0
FOCUS_HEIGHT = float(a[13]) if len(a) > 13 else 0.0
OMIT_MATERIALS = {name.strip().lower() for name in a[14].split(",") if name.strip()} if len(a) > 14 else set()
INCLUDE_OBJECTS = {name.strip() for name in a[15].split(",") if name.strip()} if len(a) > 15 else set()
ANIMATION_FRAME = int(a[16]) if len(a) > 16 and a[16].strip() else None
SOURCE_YAW = float(a[17]) if len(a) > 17 and a[17].strip() else 0.0
DIRECTION_YAWS = {
    "south": 0,
    "south-west": -45,
    "west": -90,
    "north-west": -135,
    "north": 180,
    "north-east": 135,
    "east": 90,
    "south-east": 45,
}
if FACING not in DIRECTION_YAWS and FACING != "all":
    raise SystemExit("unsupported board facing: " + FACING)
if ENGINE not in ("cycles", "eevee"):
    raise SystemExit("unsupported render engine: " + ENGINE)
if FRAMING not in ("contact", "source"):
    raise SystemExit("unsupported framing mode: " + FRAMING)
if ROT not in ("none", "x90", "x-90", "autoz", "principal-plane"):
    raise SystemExit("unsupported source rotation: " + ROT)
if not math.isfinite(FRAMING_SCALE) or FRAMING_SCALE <= 0:
    raise SystemExit("framing scale must be a finite number greater than zero")
if not math.isfinite(FOCUS_HEIGHT) or FOCUS_HEIGHT < 0 or FOCUS_HEIGHT >= 1:
    raise SystemExit("focus height must be a finite number from zero up to, but not including, one")
if ANIMATION_FRAME is not None and ANIMATION_FRAME < 0:
    raise SystemExit("animation frame must be zero or greater")
if not math.isfinite(SOURCE_YAW):
    raise SystemExit("source yaw must be finite")
# SCALE now means the horizontal FOOTPRINT target in Blender units (max of x/y extent), so a boxy
# house and a tall house both seat their BASE at the same on-board size — unlike largest-dim, which
# over-scaled wide houses and clipped them.
FOOTPRINT = SCALE
if FACING == "all":
    os.makedirs(OUT, exist_ok=True)
else:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

if IMPORT not in ("none", "-", ""):
    # fresh scene + import the mesh by extension
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
    ext = os.path.splitext(IMPORT)[1].lower()
    if ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=IMPORT)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=IMPORT)
    elif ext == ".obj":
        try:
            bpy.ops.wm.obj_import(filepath=IMPORT)
        except Exception:
            bpy.ops.import_scene.obj(filepath=IMPORT)
    elif ext == ".dae":
        bpy.ops.wm.collada_import(filepath=IMPORT)
    elif ext == ".3ds":
        try:
            bpy.ops.import_scene.max3ds(filepath=IMPORT)
        except Exception as error:
            raise SystemExit("Blender official extension autodesk_3ds_format is required for .3ds source art: " + str(error))
    else:
        raise SystemExit("unsupported mesh ext: " + ext)
for collection in bpy.data.collections:
    collection.hide_render = False
    collection.hide_viewport = False
if ANIMATION_FRAME is not None:
    bpy.context.scene.frame_set(ANIMATION_FRAME)
    print("PROP_ANIMATION_FRAME", ANIMATION_FRAME)
if INCLUDE_OBJECTS:
    found_objects = {
        obj.name for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name in INCLUDE_OBJECTS
    }
    missing_objects = INCLUDE_OBJECTS - found_objects
    if missing_objects:
        raise SystemExit("included source objects were not found: " + ", ".join(sorted(missing_objects)))
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name not in INCLUDE_OBJECTS:
            bpy.data.objects.remove(obj, do_unlink=True)
    print("PROP_INCLUDED_OBJECTS", ",".join(sorted(INCLUDE_OBJECTS)))

# Relink textures: importers/.blend often carry broken image paths (renders grey/magenta).
# Point Blender at the archive's texture folder and re-resolve every missing image.
if TEXDIR and os.path.isdir(TEXDIR):
    texture_paths = {}
    for root, _dirs, files in os.walk(TEXDIR):
        for filename in files:
            texture_paths.setdefault(filename.lower(), os.path.join(root, filename))

    def external_texture_for_image(img):
        base = os.path.basename(img.filepath.replace("\\", "/")).lower()
        if base and base in texture_paths:
            return texture_paths[base]
        image_stem = os.path.splitext(img.name)[0].lower()
        exact = next(
            (path for filename, path in texture_paths.items() if os.path.splitext(filename)[0] == image_stem),
            None,
        )
        if exact:
            return exact
        # Blender 5.1 can import a GLB's packed images without decoded pixel data. Provider
        # archives export those same images beside the GLB under either Image_N_* or
        # gltf_embedded_N names, so reconnect them by their stable glTF image index.
        index_match = re.search(r"(?:image_|gltf_embedded_)(\d+)", image_stem)
        if not index_match:
            return None
        index = index_match.group(1)
        prefixes = (f"image_{index}", f"gltf_embedded_{index}")
        candidates = [
            path for filename, path in texture_paths.items()
            if os.path.splitext(filename)[0].startswith(prefixes)
        ]
        candidates.sort(key=lambda path: ("@channels=" in os.path.basename(path).lower(), len(os.path.basename(path))))
        return candidates[0] if candidates else None

    for img in list(bpy.data.images):
        if img.has_data:
            continue
        cand = external_texture_for_image(img)
        if cand:
            try:
                replacement = bpy.data.images.load(cand, check_existing=True)
                for mat in bpy.data.materials:
                    if not mat.use_nodes:
                        continue
                    for node in mat.node_tree.nodes:
                        if node.type == "TEX_IMAGE" and node.image == img:
                            node.image = replacement
                print("PROP_EXTERNAL_TEXTURE", img.name, cand)
                continue
            except Exception:
                pass
        if img.source == "FILE":
            try:
                img.reload()
            except Exception:
                pass
    try:
        bpy.ops.file.find_missing_files(directory=TEXDIR)
    except Exception:
        pass
    # Auto-wire: if a material's Base Color isn't driven by a loaded image, plug in the best
    # matching colour texture from TEXDIR (skip AO/normal/spec/displacement maps). Handles FBX/OBJ
    # whose importer left materials flat, and single-atlas models (one texture for all materials).
    SKIP = ("_ao", "_arm", "_nm", "_sp", "_dp", "_normal", "_norm", "_rough", "roughness", "_metal", "_disp", "_height", "opacity")
    imgfiles = [path for path in texture_paths.values() if path.lower().endswith((".png", ".jpg", ".jpeg", ".tga"))]
    colorfiles = [path for path in imgfiles if not any(s in os.path.basename(path).lower() for s in SKIP)] or imgfiles
    semantic_colorfiles = [
        path for path in colorfiles
        if any(token in os.path.basename(path).lower() for token in ("basecolor", "base_color", "diffuse", "albedo"))
    ]
    material_colorfiles = {}
    for root, _dirs, files in os.walk(TEXDIR):
        for filename in files:
            if not filename.lower().endswith(".mtl"):
                continue
            material_name = None
            try:
                with open(os.path.join(root, filename), "r", encoding="utf-8", errors="replace") as stream:
                    for raw_line in stream:
                        line = raw_line.strip()
                        if line.lower().startswith("newmtl "):
                            material_name = line[7:].strip().lower()
                        elif material_name and line.lower().startswith("map_kd "):
                            relative = line[7:].strip().replace("\\", "/")
                            mapped = os.path.normpath(os.path.join(root, relative))
                            if not os.path.isfile(mapped):
                                mapped = texture_paths.get(os.path.basename(relative).lower(), "")
                            if mapped and os.path.isfile(mapped):
                                material_colorfiles.setdefault(material_name, mapped)
            except OSError:
                pass
    numbered_colorfiles = {}
    for filename in sorted(colorfiles):
        match = re.search(r"\.(\d{4})\.(?:png|jpe?g|tga)$", os.path.basename(filename), re.IGNORECASE)
        if match:
            numbered_colorfiles.setdefault(int(match.group(1)), filename)
    numbered_material_textures = [numbered_colorfiles[key] for key in sorted(numbered_colorfiles)]
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        output = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
        if not output:
            output = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if not output:
            output = nt.nodes.new("ShaderNodeOutputMaterial")
        surface = output.inputs.get("Surface")
        if surface and (not surface.is_linked or surface.links[0].from_node != bsdf):
            nt.links.new(bsdf.outputs["BSDF"], surface)
        bc = bsdf.inputs.get("Base Color")
        if bc.is_linked:
            if upstream_image_node(bc):
                continue
            for link in list(bc.links):
                nt.links.remove(link)
        mn = mat.name.lower()
        # Prefer the colour map whose semantic stem exactly matches the material. Provider-prefixed
        # assets commonly have `asset`, `asset_branches`, and `asset_leaves` materials; a broad
        # provider-name match paints the whole tree with bark.
        pick = material_colorfiles.get(mn)
        if not pick:
            pick = next(
                (f for f in colorfiles if os.path.basename(f).lower().startswith(mn + "_diff")),
                None,
            )
        if not pick:
            pick = next(
                (f for f in colorfiles if os.path.basename(f).lower().startswith(mn + "_basecolor")),
                None,
            )
        if not pick:
            pick = next((f for f in colorfiles if any(tok in os.path.basename(f).lower() for tok in mn.split("_") if len(tok) > 3)), None)
        if not pick:
            numbered_material = re.fullmatch(r"m(\d+)", mn)
            numbered_index = int(numbered_material.group(1)) if numbered_material else -1
            if 0 <= numbered_index < len(numbered_material_textures):
                pick = numbered_material_textures[numbered_index]
        if not pick and len(semantic_colorfiles) == 1:
            pick = semantic_colorfiles[0]
        if not pick and len(colorfiles) == 1:
            pick = colorfiles[0]
        if not pick:
            continue
        try:
            img = bpy.data.images.load(pick, check_existing=True)
            tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
            nt.links.new(tex.outputs["Color"], bc)
        except Exception:
            pass
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        mat.use_backface_culling = False
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        bc = bsdf.inputs.get("Base Color") if bsdf else None
        alpha = bsdf.inputs.get("Alpha") if bsdf else None
        if alpha and not alpha.is_linked:
            alpha.default_value = 1.0
        weight = bsdf.inputs.get("Weight") if bsdf else None
        if weight:
            if weight.is_linked:
                mat.node_tree.links.remove(weight.links[0])
            weight.default_value = 1.0
        transmission = (bsdf.inputs.get("Transmission Weight") or bsdf.inputs.get("Transmission")) if bsdf else None
        if transmission:
            if transmission.is_linked:
                mat.node_tree.links.remove(transmission.links[0])
            transmission.default_value = 0.0
        linked = upstream_image_node(bc)
        image_path = linked.image.filepath if linked and linked.image else ""
        print(
            "PROP_MATERIAL",
            mat.name,
            image_path or "untextured",
            "alpha", alpha.default_value if alpha and not alpha.is_linked else "linked",
            "backface_culling", mat.use_backface_culling,
        )

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no mesh objects found")
# Bake each mesh's authored static evaluated state while its armature and other dependencies still
# exist. Deleting a rig first can make Blender evaluate a skinned FBX as a tiny collapsed point even
# though the raw mesh coordinates and bounds remain full-sized.
for o in meshes:
    o.hide_render = False
    o.hide_viewport = False
    o.hide_set(False)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    needs_evaluated_bake = False
    for modifier in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception:
            needs_evaluated_bake = True
            break
    if needs_evaluated_bake:
        # Shape-keyed glTF animals cannot accept Blender's modifier_apply operation. Capture the
        # evaluated skinned mesh instead, while the armature is still present, so the source pose
        # does not collapse back into its unposed basis when the rig is removed below.
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        evaluated = o.evaluated_get(depsgraph)
        baked_mesh = bpy.data.meshes.new_from_object(
            evaluated,
            preserve_all_data_layers=True,
            depsgraph=depsgraph,
        )
        old_mesh = o.data
        o.data = baked_mesh
        o.modifiers.clear()
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)
        print("PROP_EVALUATED_MESH_BAKE", o.name)
# Preserve every mesh's assembled world transform before dropping source parents. Some static FBX
# exports use an armature object only as a transform parent, with no Armature modifier. Deleting
# that parent first leaves its children carrying incompatible local transforms and visually
# explodes or tips the complete prop even though every individual mesh remains valid.
for o in meshes:
    world_matrix = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = world_matrix
# Drop the source scene's own cameras/lights/armatures/empties after the static mesh is baked and
# detached without changing its world-space assembly.
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        try: bpy.data.objects.remove(o, do_unlink=True)
        except Exception: pass
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.hide_render = False
    o.hide_viewport = False
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
# Bake each object's world transform (the .blend / importer rotation+scale) into the mesh data.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
imported_object = bpy.context.view_layer.objects.active
# Copy the joined mesh onto a clean root-scene object. FBX can carry visibility animation,
# constraints, instancer flags, or collection state that are irrelevant to a static source-art
# turntable but still affect final-frame rendering.
clean_mesh = imported_object.data.copy()
g = bpy.data.objects.new("SourceArtSubject", clean_mesh)
bpy.context.scene.collection.objects.link(g)
g.matrix_world = imported_object.matrix_world.copy()
bpy.data.objects.remove(imported_object, do_unlink=True)
bpy.context.view_layer.objects.active = g
g.select_set(True)
if hasattr(g, "visible_camera"):
    g.visible_camera = True
if hasattr(g, "is_holdout"):
    g.is_holdout = False
if hasattr(g, "is_shadow_catcher"):
    g.is_shadow_catcher = False
if OMIT_MATERIALS:
    material_indices = {
        index for index, slot in enumerate(g.material_slots)
        if slot.material and slot.material.name.lower() in OMIT_MATERIALS
    }
    found_materials = {
        slot.material.name.lower() for index, slot in enumerate(g.material_slots)
        if index in material_indices and slot.material
    }
    missing_materials = OMIT_MATERIALS - found_materials
    if missing_materials:
        raise SystemExit("omitted source materials were not found: " + ", ".join(sorted(missing_materials)))
    for polygon in g.data.polygons:
        polygon.select = polygon.material_index in material_indices
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    g.data.update()
    print("PROP_OMITTED_MATERIALS", ",".join(sorted(OMIT_MATERIALS)))
# Imported DCC shaders are not a dependable render contract: FBX exporters can preserve a
# zero-weight or transmissive standard-surface shader even when the authored intent is an opaque
# textured prop. Rebuild each joined material as a minimal Principled surface while retaining its
# resolved base-colour image, UVs, and alpha. These renders are source-art references, so a
# predictable visible surface is more important than renderer-specific shader graphs.
for slot in g.material_slots:
    mat = slot.material
    if not mat:
        continue
    nt = mat.node_tree
    old_bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None) if nt else None
    old_bc = old_bsdf.inputs.get("Base Color") if old_bsdf else None
    old_linked = upstream_image_node(old_bc)
    old_image = old_linked.image if old_linked else None
    old_alpha = old_bsdf.inputs.get("Alpha") if old_bsdf else None
    old_alpha_linked = upstream_image_node(old_alpha)
    old_alpha_image = old_alpha_linked.image if old_alpha_linked else None
    old_alpha_value = old_alpha.default_value if old_alpha and not old_alpha.is_linked else 1.0
    old_color = tuple(old_bc.default_value) if old_bc else tuple(mat.diffuse_color)
    nt.nodes.clear()
    output = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = old_color
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Alpha"].default_value = old_alpha_value
    nt.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    if old_image:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = old_image
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if old_image.depth == 32:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    if old_alpha_image and old_alpha_image != old_image:
        alpha_tex = nt.nodes.new("ShaderNodeTexImage")
        alpha_tex.image = old_alpha_image
        nt.links.new(alpha_tex.outputs["Color"], bsdf.inputs["Alpha"])
    if old_alpha_image or (old_image and old_image.depth == 32):
        try:
            mat.surface_render_method = "DITHERED"
        except Exception:
            try:
                mat.blend_method = "BLEND"
            except Exception:
                pass
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.reveal()
bpy.ops.mesh.select_all(action="SELECT")
try:
    bpy.ops.mesh.normals_make_consistent(inside=False)
except Exception:
    pass
bpy.ops.object.mode_set(mode="OBJECT")
render_vertex_indices = sorted({index for polygon in g.data.polygons for index in polygon.vertices})
if not render_vertex_indices:
    raise SystemExit("mesh contains no renderable faces")

def render_coords():
    return np.array([g.data.vertices[index].co for index in render_vertex_indices])

if ROT == "x90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "X"))
elif ROT == "x-90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
elif ROT == "autoz":
    co = render_coords()
    ax = int(np.argmax(co.max(0) - co.min(0)))
    if ax == 0:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "Y"))
    elif ax == 1:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
elif ROT == "principal-plane":
    co = render_coords()
    _eigenvalues, eigenvectors = np.linalg.eigh(np.cov(co.T))
    normal = mathutils.Vector(eigenvectors[:, 0])
    if normal.z < 0:
        normal.negate()
    g.data.transform(normal.rotation_difference(mathutils.Vector((0, 0, 1))).to_matrix().to_4x4())
if SOURCE_YAW:
    g.data.transform(mathutils.Matrix.Rotation(math.radians(SOURCE_YAW), 4, "Z"))
    print("PROP_SOURCE_YAW", SOURCE_YAW)
g.data.update()

# Fit-normalise: scale the horizontal FOOTPRINT (max of x/y extent) to FOOTPRINT units; centre XY;
# ground foot (min z) to z=0. (Footprint-based so the base size is consistent and the projection fits.)
c = render_coords()
ext = (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min())
print("PROP_GEOMETRY_SOURCE", len(g.data.vertices), len(c), ext)
print("PROP_GEOMETRY_TOPOLOGY", len(g.data.edges), len(g.data.polygons), len(g.data.materials))
s = FOOTPRINT / max(ext[0], ext[1]); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
c = render_coords()
print("PROP_GEOMETRY_NORMALIZED", (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min()))
focus = c
if FRAMING == "source" and FOCUS_HEIGHT > 0:
    focus_floor = c[:, 2].min() + (c[:, 2].max() - c[:, 2].min()) * FOCUS_HEIGHT
    focus = c[c[:, 2] >= focus_floor]
    if not len(focus):
        raise SystemExit("focus height selected no source geometry")
print("PROP_GEOMETRY_FOCUS", FOCUS_HEIGHT, len(focus), focus.min(0), focus.max(0))
g.location = (
    -(focus[:, 0].min() + focus[:, 0].max()) / 2,
    -(focus[:, 1].min() + focus[:, 1].max()) / 2,
    -c[:, 2].min(),
)
bpy.ops.object.transform_apply(location=True)
# Camera framing must use the final grounded coordinates. Some authored FBX files place their
# vertices far from world zero; retaining the pre-grounding array aims the source-frame camera at
# that stale height and produces a completely transparent render even though the mesh is valid.
c = render_coords()
if FACING != "all":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(DIRECTION_YAWS[FACING]), 4, "Z"))
    g.data.update()

if HALF in ("front", "back"):
    bpy.context.view_layer.objects.active = g
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(1, -1, 0),
                        clear_inner=(HALF == "front"), clear_outer=(HALF == "back"), use_fill=False)
    bpy.ops.object.mode_set(mode="OBJECT")

sc = bpy.context.scene; w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.55, 0.6, 0.7, 1)
w.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.9
bpy.ops.object.light_add(type="SUN"); k = bpy.context.object
k.rotation_euler = (math.radians(52), math.radians(8), math.radians(-42)); k.data.energy = 1.7; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 4)); bpy.context.object.data.energy = 140; bpy.context.object.data.size = 9; bpy.context.object.data.color = (.78, .84, 1)
# px/unit held at 137.4 (the 1x1 doodad rig: 180px/1.31u) so seating math is frame-size-independent;
# ortho_scale scales with frame height. TZ solved so the foot lands 45px above the bottom edge
# (screen_y(foot) = FH/2 + TZ*116.7  =>  foot at FH-45).
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2)
# Camera look-at height. Frame is rendered generously oversized and CROPPED to content in PIL
# afterwards, so this just needs to keep the whole prop comfortably inside the frame (not precise).
co = np.array([v.co for v in g.data.vertices])
frame_target_z = (co[:, 2].min() + co[:, 2].max()) / 2 if FRAMING == "source" else TZ
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + frame_target_z)
cam.rotation_euler = (mathutils.Vector((0, 0, frame_target_z)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"
if FRAMING == "source":
    ext_x = co[:, 0].max() - co[:, 0].min()
    ext_y = co[:, 1].max() - co[:, 1].min()
    ext_z = co[:, 2].max() - co[:, 2].min()
    radius_xy = math.sqrt((ext_x / 2) ** 2 + (ext_y / 2) ** 2)
    projected_h = ext_z * math.cos(E) + 2 * radius_xy * math.sin(E)
    projected_w = 2 * radius_xy
    cam.data.ortho_scale = max(projected_h, projected_w * FH / FW) * 1.18 * FRAMING_SCALE
else:
    cam.data.ortho_scale = FH / 137.4
if ENGINE == "eevee":
    # Blender 5.1 folded Eevee Next back into the BLENDER_EEVEE enum name; 4.x used
    # BLENDER_EEVEE_NEXT. Select the available engine without changing the render contract.
    try:
        sc.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        sc.render.engine = "BLENDER_EEVEE"
else:
    sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = FW; sc.render.resolution_y = FH; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"
if FACING == "all":
    for direction, yaw in DIRECTION_YAWS.items():
        g.rotation_euler[2] = math.radians(yaw)
        sc.render.filepath = os.path.join(OUT, direction + ".png")
        bpy.ops.render.render(write_still=True)
        print("PROP_MESH_DIRECTION_DONE", direction, HALF, ENGINE, FRAMING, FRAMING_SCALE, FOCUS_HEIGHT, sc.render.filepath)
    print("PROP_MESH_TURNTABLE_DONE", HALF, ENGINE, FRAMING, FRAMING_SCALE, FOCUS_HEIGHT, OUT)
else:
    sc.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("PROP_MESH_DONE", FACING, HALF, ENGINE, FRAMING, FRAMING_SCALE, FOCUS_HEIGHT, OUT)
