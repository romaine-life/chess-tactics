import bpy, math, mathutils, sys, os
import numpy as np
# Render an AUTHORED mesh (a sourced .blend/.fbx/.obj/.gltf house, NOT code-drawn geometry) into
# the board's PropSprite frame: 192x300, contact GROUND-CENTRE at (96,255), same iso rig as the
# tree. Two entry modes:
#   blender -b -P render_prop_mesh.py -- OUT <mesh.fbx|.obj|.gltf|.glb> SCALE HALF [ROT]   (imports)
#   blender <scene.blend> -b -P render_prop_mesh.py -- OUT none SCALE HALF [ROT]           (uses open scene)
# HALF in {full,front,back}. ROT in {none,x90,x-90,autoz}.
a = sys.argv[sys.argv.index("--") + 1:]
OUT = a[0]
IMPORT = a[1] if len(a) > 1 else "none"
SCALE = float(a[2]) if len(a) > 2 else 1.55
HALF = a[3] if len(a) > 3 else "full"
ROT = a[4] if len(a) > 4 else "none"
TEXDIR = a[5] if len(a) > 5 else ""  # folder to search for missing texture images (relink)
FW = int(a[6]) if len(a) > 6 else 320   # frame width  (generous so the iso projection never clips)
FH = int(a[7]) if len(a) > 7 else 420   # frame height
# SCALE now means the horizontal FOOTPRINT target in Blender units (max of x/y extent), so a boxy
# house and a tall house both seat their BASE at the same on-board size — unlike largest-dim, which
# over-scaled wide houses and clipped them.
FOOTPRINT = SCALE
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
    else:
        raise SystemExit("unsupported mesh ext: " + ext)

# Relink textures: importers/.blend often carry broken image paths (renders grey/magenta).
# Point Blender at the archive's texture folder and re-resolve every missing image.
if TEXDIR and os.path.isdir(TEXDIR):
    for img in bpy.data.images:
        if img.source == "FILE" and not img.has_data:
            base = os.path.basename(img.filepath.replace("\\", "/"))
            cand = os.path.join(TEXDIR, base)
            if base and os.path.exists(cand):
                img.filepath = cand
        try: img.reload()
        except Exception: pass
    try:
        bpy.ops.file.find_missing_files(directory=TEXDIR)
    except Exception:
        pass
    # Auto-wire: if a material's Base Color isn't driven by a loaded image, plug in the best
    # matching colour texture from TEXDIR (skip AO/normal/spec/displacement maps). Handles FBX/OBJ
    # whose importer left materials flat, and single-atlas models (one texture for all materials).
    SKIP = ("_ao", "_nm", "_sp", "_dp", "_normal", "_norm", "_rough", "_metal", "_disp", "_height")
    imgfiles = [f for f in os.listdir(TEXDIR) if f.lower().endswith((".png", ".jpg", ".jpeg", ".tga"))]
    colorfiles = [f for f in imgfiles if not any(s in f.lower() for s in SKIP)] or imgfiles
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        bc = bsdf.inputs.get("Base Color")
        if bc.is_linked:
            src = bc.links[0].from_node
            if src.type == "TEX_IMAGE" and src.image and src.image.has_data:
                continue
        mn = mat.name.lower()
        pick = next((f for f in colorfiles if mn[:5] and mn[:5] in f.lower()), None)
        if not pick:
            pick = next((f for f in colorfiles if any(tok in f.lower() for tok in mn.split("_") if len(tok) > 3)), None)
        if not pick and len(colorfiles) == 1:
            pick = colorfiles[0]
        if not pick:
            continue
        try:
            img = bpy.data.images.load(os.path.join(TEXDIR, pick), check_existing=True)
            tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
            nt.links.new(tex.outputs["Color"], bc)
        except Exception:
            pass

# Drop the source scene's own cameras/lights/empties; keep only meshes.
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        try: bpy.data.objects.remove(o, do_unlink=True)
        except Exception: pass
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit("no mesh objects found")
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
# Bake each object's world transform (the .blend / importer rotation+scale) into the mesh data.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
g = bpy.context.view_layer.objects.active

if ROT == "x90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "X"))
elif ROT == "x-90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
elif ROT == "autoz":
    co = np.array([v.co for v in g.data.vertices])
    ax = int(np.argmax(co.max(0) - co.min(0)))
    if ax == 0:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "Y"))
    elif ax == 1:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
g.data.update()

# Fit-normalise: scale the horizontal FOOTPRINT (max of x/y extent) to FOOTPRINT units; centre XY;
# ground foot (min z) to z=0. (Footprint-based so the base size is consistent and the projection fits.)
c = np.array([v.co for v in g.data.vertices])
ext = (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min())
s = FOOTPRINT / max(ext[0], ext[1]); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
c = np.array([v.co for v in g.data.vertices])
g.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min())
bpy.ops.object.transform_apply(location=True)

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
k.rotation_euler = (math.radians(52), math.radians(8), math.radians(-42)); k.data.energy = 5.2; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 4)); bpy.context.object.data.energy = 220; bpy.context.object.data.size = 9; bpy.context.object.data.color = (.78, .84, 1)
# px/unit held at 137.4 (the 1x1 doodad rig: 180px/1.31u) so seating math is frame-size-independent;
# ortho_scale scales with frame height. TZ solved so the foot lands 45px above the bottom edge
# (screen_y(foot) = FH/2 + TZ*116.7  =>  foot at FH-45).
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2)
# Camera look-at height. Frame is rendered generously oversized and CROPPED to content in PIL
# afterwards, so this just needs to keep the whole prop comfortably inside the frame (not precise).
TZ = float(a[8]) if len(a) > 8 else 0.5
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + TZ)
cam.rotation_euler = (mathutils.Vector((0, 0, TZ)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = FH / 137.4
sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = FW; sc.render.resolution_y = FH; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("PROP_MESH_DONE", HALF, OUT)
