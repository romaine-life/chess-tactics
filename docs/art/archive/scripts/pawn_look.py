import bpy, math, mathutils, os, numpy as np
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene

print("=== OBJECTS ===")
for o in bpy.data.objects:
    print("  %-18s type=%-7s dims=(%.2f,%.2f,%.2f) parent=%s" % (
        o.name, o.type, o.dimensions.x, o.dimensions.y, o.dimensions.z, o.parent.name if o.parent else None))
print("=== MATERIALS ===")
for m in bpy.data.materials:
    bsdf = next((n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED"), None) if m.use_nodes else None
    base = tuple(round(x,3) for x in bsdf.inputs["Base Color"].default_value) if bsdf else None
    print("  %-18s base=%s" % (m.name, base))

# normalize the pawn meshes to the standard pose: center xy, base z=0, height -> 2
meshes = [o for o in scene.objects if o.type == "MESH"]
cs = []
for o in meshes:
    for c in o.bound_box:
        cs.append(o.matrix_world @ mathutils.Vector(c))
mn = mathutils.Vector((min(v[i] for v in cs) for i in range(3)))
mx = mathutils.Vector((max(v[i] for v in cs) for i in range(3)))
center = (mn + mx) / 2.0; s = 2.0 / (mx.z - mn.z)
rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
for o in meshes:
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()
rig.scale = (s, s, s); rig.location = (-s*center.x, -s*center.y, -s*mn.z)
print("normalized: height was %.3f, scale %.3f" % (mx.z-mn.z, s))

# clear existing cams/lights, set the contract rig + cool lighting (match rook/knight)
for o in list(scene.objects):
    if o.type in {"CAMERA", "LIGHT"}: bpy.data.objects.remove(o, do_unlink=True)
w = scene.world or bpy.data.worlds.new("W"); scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background")
if bg: bg.inputs["Color"].default_value=(0.02,0.03,0.05,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN", location=(-3,-4,8)); k=bpy.context.object
k.rotation_euler=(math.radians(50),0,math.radians(-38)); k.data.energy=3.0; k.data.color=(0.85,0.92,1.0)
bpy.ops.object.light_add(type="AREA", location=(3.5,-3,3)); bpy.context.object.data.energy=130; bpy.context.object.data.size=6; bpy.context.object.data.color=(0.7,0.78,1.0)
bpy.ops.object.light_add(type="AREA", location=(-2,4,4.5)); bpy.context.object.data.energy=80; bpy.context.object.data.size=4; bpy.context.object.data.color=(0.55,0.7,1.0)

E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; scene.camera=cam
cam.location=(comp,-comp,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7
try: scene.render.engine="CYCLES"; scene.cycles.samples=48; scene.cycles.use_denoising=True
except Exception: pass
scene.view_settings.view_transform="Standard"
scene.render.resolution_x=scene.render.resolution_y=512; scene.render.film_transparent=True
scene.render.image_settings.file_format="PNG"; scene.render.filepath=os.path.join(OUT,"pawn_current_south")
bpy.ops.render.render(write_still=True)
print("rendered pawn_current_south.png")
