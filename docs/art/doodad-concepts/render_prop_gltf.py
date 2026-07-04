import bpy, math, mathutils, sys, os
import numpy as np
# Multi-cell PROP render from a glTF mesh. Same import/stand-up/fit/split as render_doodad_gltf.py,
# but framed for the board's PropSprite: 192x300, contact GROUND-CENTRE at pixel (96,255),
# px/unit kept equal to the 1x1 doodad rig (137.4) so a 2x2 prop reads at true relative scale.
#   blender -b -P render_prop_gltf.py -- OUT GLTF SCALE HALF
#   HALF in {full, front, back}. SCALE = largest-dim target in Blender units (~1.95 for a 2x2 tree).
a = sys.argv[sys.argv.index("--") + 1:]
OUT, GLTF = a[0], a[1]
SCALE = float(a[2]) if len(a) > 2 else 1.95
HALF = a[3] if len(a) > 3 else "full"
ROT = a[4] if len(a) > 4 else "x90"  # stand-up: x90 (Y-up lying down), none (already Z-up), x-90, autoz

for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.images, bpy.data.textures):
    for b in list(c):
        if getattr(b, 'users', 0) == 0:
            c.remove(b)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.import_scene.gltf(filepath=GLTF)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
g = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Stand-up: doodad ground props import Y-up lying down (+90 about X stands them). Trees vary, so
# this is parameterised. 'autoz' rotates the longest principal axis to vertical (good for tall trees).
if ROT == "x90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "X"))
elif ROT == "x-90":
    g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
elif ROT == "autoz":
    co = np.array([v.co for v in g.data.vertices])
    ax = int(np.argmax(co.max(0) - co.min(0)))  # longest extent axis -> make it Z
    if ax == 0:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "Y"))
    elif ax == 1:
        g.data.transform(mathutils.Matrix.Rotation(math.radians(-90), 4, "X"))
g.data.update()
# Fit-normalise: largest dim = SCALE; centre XY; ground foot to z=0.
c = np.array([v.co for v in g.data.vertices])
ext = (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min())
s = SCALE / max(ext); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
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
w.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.03, 0.04, 0.06, 1)
w.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
bpy.ops.object.light_add(type="SUN"); k = bpy.context.object
k.rotation_euler = (math.radians(48), math.radians(8), math.radians(-42)); k.data.energy = 3.8; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 4)); bpy.context.object.data.energy = 110; bpy.context.object.data.size = 8; bpy.context.object.data.color = (.7, .78, 1)
# Prop camera: 192x300, contact ground-centre at (96,255). ortho_scale=2.183, TZ=0.900 (see placeholder).
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2); TZ = 0.900
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + TZ)
cam.rotation_euler = (mathutils.Vector((0, 0, TZ)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.183
sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = 192; sc.render.resolution_y = 300; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("PROP_GLTF_DONE", HALF, OUT)
