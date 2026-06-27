import bpy, math, mathutils, sys, os
import numpy as np
# Generic doodad render: import any glTF prop, normalise it to a ground-anchored clump, split
# it into front/back halves at the contact plane, and render the 96x180 / (48,69)-anchored
# sprite the board expects. Same camera + split as render_doodad.py (grass) so the output
# drops straight into <DoodadSprite>; only the source import + material differ.
#   blender -b -P render_doodad_gltf.py -- OUT GLTF SCALE HALF [COUNT] [SPREAD]
#   HALF in {full, front, back}.  COUNT>1 scatters copies into a clump (grass-like).
a = sys.argv[sys.argv.index("--") + 1:]
OUT, GLTF = a[0], a[1]
SCALE = float(a[2]) if len(a) > 2 else 0.4
HALF = a[3] if len(a) > 3 else "full"
COUNT = int(a[4]) if len(a) > 4 else 1
SPREAD = float(a[5]) if len(a) > 5 else 0.34

for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.images, bpy.data.textures):
    for b in list(c):
        if getattr(b, 'users', 0) == 0:
            c.remove(b)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

bpy.ops.import_scene.gltf(filepath=GLTF)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
# Bake the importer's up-axis conversion (and any parent empties) into the meshes.
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
# Poly Haven glTF is Y-up and this background importer does NOT convert it, so the prop
# imports lying down (height along Y). Stand it up — +90deg about X sends +Y to +Z. Transform
# the MESH DATA directly with a matrix: the object operator (transform_apply) silently no-ops
# in background here, which left props lying down and inflated.
g.data.transform(mathutils.Matrix.Rotation(math.radians(90), 4, "X"))
g.data.update()
# Fit-normalise: scale so the prop's LARGEST dimension = SCALE. Orientation-invariant and
# bounds the footprint in BOTH axes, so a wide prop (stump, fern) can't overflow the 96px-wide
# frame the way height-only scaling did. Then centre in XY and ground the foot (min z) to z=0
# so the contact point lands on the same screen pixel (48,69) for every prop.
c = np.array([v.co for v in g.data.vertices])
ext = (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min())
s = SCALE / max(ext); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
c = np.array([v.co for v in g.data.vertices]); g.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min()); bpy.ops.object.transform_apply(location=True)

clumps = [g]
for i in range(max(0, COUNT - 1)):
    h = (i * 2654435761) & 0xffffffff
    x = ((h % 1000) / 1000.0 - 0.5) * SPREAD
    y = (((h >> 10) % 1000) / 1000.0 - 0.5) * SPREAD
    rot = ((h >> 5) % 360) * math.pi / 180.0
    d = g.copy(); d.data = g.data.copy(); bpy.context.collection.objects.link(d)
    d.location = (x, y, 0); d.rotation_euler = (0, 0, rot)
    clumps.append(d)
bpy.ops.object.select_all(action="DESELECT")
for cc in clumps:
    cc.select_set(True)
bpy.context.view_layer.objects.active = g
if len(clumps) > 1:
    bpy.ops.object.join()
G = bpy.context.view_layer.objects.active
# Front/back split: vertical plane through the foot, perpendicular to the toward-viewer
# axis (1,-1,0). +side faces the camera (front, occludes the unit); -side is away (back).
if HALF in ("front", "back"):
    bpy.context.view_layer.objects.active = G
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(1, -1, 0),
                        clear_inner=(HALF == "front"), clear_outer=(HALF == "back"), use_fill=False)
    bpy.ops.object.mode_set(mode="OBJECT")

sc = bpy.context.scene; w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.03, 0.04, 0.06, 1); w.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
bpy.ops.object.light_add(type="SUN"); k = bpy.context.object; k.rotation_euler = (math.radians(48), math.radians(8), math.radians(-42)); k.data.energy = 3.8; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 3)); bpy.context.object.data.energy = 80; bpy.context.object.data.size = 7; bpy.context.object.data.color = (.7, .78, 1)
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2); TZ = -0.18
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + TZ); cam.rotation_euler = (mathutils.Vector((0, 0, TZ)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.31
sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"; sc.render.resolution_x = 96; sc.render.resolution_y = 180; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("DOODAD_DONE", HALF, OUT)
