import bpy, math, mathutils, sys, os, glob
import numpy as np
# args: OUT SRC [SCALE] [HALF]   HALF in {full,front,back}
a = sys.argv[sys.argv.index("--") + 1:]
OUT, SRC = a[0], a[1]
SCALE = float(a[2]) if len(a) > 2 else 0.30
HALF = a[3] if len(a) > 3 else "full"

for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.images, bpy.data.textures):
    for b in list(c):
        if getattr(b, 'users', 0) == 0:
            c.remove(b)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

OBJ = glob.glob(os.path.join(SRC, "grass-02", "inner", "*.obj"))[0]
GTEX = glob.glob(os.path.join(SRC, "grass-02", "inner", "2023*.png"))[0]
bpy.ops.wm.obj_import(filepath=OBJ)
gs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in gs:
    o.select_set(True)
bpy.context.view_layer.objects.active = gs[0]
if len(gs) > 1:
    bpy.ops.object.join()
g = bpy.context.view_layer.objects.active; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
g.rotation_euler = (math.radians(90), 0, 0); bpy.ops.object.transform_apply(rotation=True)
c = np.array([v.co for v in g.data.vertices]); s = SCALE / (c[:, 2].max() - c[:, 2].min()); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
c = np.array([v.co for v in g.data.vertices]); g.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min()); bpy.ops.object.transform_apply(location=True)
gm = bpy.data.materials.new("grass"); gm.use_nodes = True; nt = gm.node_tree; b = nt.nodes.get("Principled BSDF"); b.inputs["Roughness"].default_value = 0.9
tg = nt.nodes.new("ShaderNodeTexImage"); tg.image = bpy.data.images.load(GTEX); nt.links.new(tg.outputs["Color"], b.inputs["Base Color"])
agt = nt.nodes.new("ShaderNodeMath"); agt.operation = "GREATER_THAN"; agt.inputs[1].default_value = 0.35
nt.links.new(tg.outputs["Alpha"], agt.inputs[0]); nt.links.new(agt.outputs["Value"], b.inputs["Alpha"])
g.data.materials.clear(); g.data.materials.append(gm)
clumps = [g]
for i in range(8):
    h = (i * 2654435761) & 0xffffffff
    x = ((h % 1000) / 1000.0 - 0.5) * 0.34
    y = (((h >> 10) % 1000) / 1000.0 - 0.5) * 0.34
    rot = ((h >> 5) % 360) * math.pi / 180.0
    d = g.copy(); d.data = g.data.copy(); bpy.context.collection.objects.link(d)
    d.location = (x, y, 0); d.rotation_euler = (0, 0, rot)
    clumps.append(d)
# Join the scattered blades into one mesh so it can be bisected as a unit.
bpy.ops.object.select_all(action="DESELECT")
for c in clumps:
    c.select_set(True)
bpy.context.view_layer.objects.active = g
bpy.ops.object.join()
G = bpy.context.view_layer.objects.active
# Front/back split: slice the clump with a VERTICAL plane through the foot, perpendicular to
# the toward-viewer direction. The camera sits at (+x,-y), so its azimuth is the (1,-1,0) axis;
# the +side faces the viewer (front, occludes the unit), the -side is away (back, occluded by
# the unit). A camera clip can't do this — it slices by view-depth, and since the whole clump
# sits above ground it all falls on the near side (that's why back.png came out empty).
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
