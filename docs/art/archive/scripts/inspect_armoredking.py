import bpy, math, mathutils, os, numpy as np
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene

print("=== OBJECTS (separable parts) ===")
meshes=[]
for o in bpy.data.objects:
    if o.type=="MESH":
        meshes.append(o)
        print("  MESH  %-26s dims=(%.2f,%.2f,%.2f) parent=%s" % (o.name, o.dimensions.x, o.dimensions.y, o.dimensions.z, o.parent.name if o.parent else None))
    elif o.type in ("ARMATURE","EMPTY"):
        print("  %-5s %-26s parent=%s" % (o.type, o.name, o.parent.name if o.parent else None))
print("=== COLLECTIONS ===")
for c in bpy.data.collections:
    print("  %-22s objects=%s" % (c.name, [o.name for o in c.objects][:12]))
print("=== MATERIALS ===")
for m in bpy.data.materials: print("  ", m.name)
print("mesh count=%d" % len(meshes))

# overview render: frame all meshes, keep their materials
cs=[]
for o in meshes:
    for c in o.bound_box: cs.append(o.matrix_world @ mathutils.Vector(c))
mn=mathutils.Vector((min(v[i] for v in cs) for i in range(3))); mx=mathutils.Vector((max(v[i] for v in cs) for i in range(3)))
ctr=(mn+mx)/2; size=mx-mn; M=max(size)
for o in list(scene.objects):
    if o.type in ("CAMERA","LIGHT"): bpy.data.objects.remove(o, do_unlink=True)
w=scene.world or bpy.data.worlds.new("W"); scene.world=w; w.use_nodes=True
bg=w.node_tree.nodes.get("Background");
if bg: bg.inputs["Strength"].default_value=0.5
bpy.ops.object.light_add(type="SUN",location=(3,-4,6)); bpy.context.object.data.energy=4
bpy.ops.object.light_add(type="AREA",location=(-3,-2,3)); bpy.context.object.data.energy=200; bpy.context.object.data.size=8
scene.render.engine="CYCLES"; scene.cycles.samples=40; scene.cycles.use_denoising=True
scene.view_settings.view_transform="Standard"
scene.render.resolution_x=scene.render.resolution_y=420; scene.render.film_transparent=True
def cam(loc,name):
    bpy.ops.object.camera_add(location=loc); c=bpy.context.object
    c.rotation_euler=(ctr-mathutils.Vector(loc)).to_track_quat("-Z","Y").to_euler()
    c.data.type="ORTHO"; c.data.ortho_scale=M*1.25; scene.camera=c
    scene.render.filepath=os.path.join(OUT,name); bpy.ops.render.render(write_still=True)
d=M*3
cam((ctr.x, ctr.y-d, ctr.z),"armored_FRONT")
cam((ctr.x+d*0.7, ctr.y-d*0.7, ctr.z+d*0.3),"armored_3Q")
print("done armored inspect")
