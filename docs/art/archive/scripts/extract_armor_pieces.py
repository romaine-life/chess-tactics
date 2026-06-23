import bpy, math, mathutils, os, numpy as np
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"

ob = next(o for o in bpy.data.objects if o.type == "MESH")
for m in list(ob.modifiers): ob.modifiers.remove(m)   # drop armature deform, use rest pose
for o in bpy.data.objects: o.select_set(o is ob)
bpy.context.view_layer.objects.active = ob
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bymat = {}
for o in parts:
    mn = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else "?"
    bymat[mn] = o
print("materials separated:", list(bymat.keys()))

def bbox(o):
    a=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get("co",a); c=a.reshape(-1,3)
    return c.min(0), c.max(0)

# pauldrons: split 'body' by loose parts, pick shoulder islands (upper z, offset +/-x)
body = bymat.get("body")
keep = []
for nm in ("helmet", "plume", "cloth"):
    if nm in bymat: keep.append(bymat[nm])
if body:
    for o in bpy.data.objects: o.select_set(o is body)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
    islands = [o for o in bpy.context.scene.objects if o.type=="MESH" and (o is body or o.name.startswith(body.name.split('.')[0]) ) and o not in bymat.values()]
    islands = [o for o in bpy.context.scene.objects if o.type=="MESH" and o not in keep and o is not bymat.get("head")]
    # measure
    cand=[]
    zmax = max(bbox(o)[1][2] for o in islands)
    for o in islands:
        mn,mx = bbox(o); ctr=(mn+mx)/2; sz=mx-mn; vol=sz[0]*sz[1]*sz[2]
        cand.append((o,ctr,sz,vol))
    # pauldron = upper (z>0.55*zmax), offset |x|, sizable
    sh = [c for c in cand if c[1][2] > 0.55*zmax and abs(c[1][0]) > 0.10]
    sh.sort(key=lambda c: -c[3])
    left = next((c for c in sh if c[1][0] < 0), None)
    right = next((c for c in sh if c[1][0] > 0), None)
    pauld = [c[0] for c in (left, right) if c]
    print("pauldrons found:", len(pauld), [round(c[1][0],2) for c in (left,right) if c])
    keep += pauld

# delete everything not kept
for o in list(bpy.context.scene.objects):
    if o.type in ("MESH",) and o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
    elif o.type in ("ARMATURE","EMPTY"):
        bpy.data.objects.remove(o, do_unlink=True)
print("kept pieces:", [o.name for o in keep])
for o in keep:
    mn,mx=bbox(o); print("  %-14s center=(%.2f,%.2f,%.2f) size=(%.2f,%.2f,%.2f)" % (o.name, *(mn+mx)/2, *(mx-mn)))

# render the extracted pieces (front = -Y) with their own materials
w=bpy.context.scene.world or bpy.data.worlds.new("W"); bpy.context.scene.world=w; w.use_nodes=True
w.node_tree.nodes.get("Background").inputs["Strength"].default_value=0.6
bpy.ops.object.light_add(type="SUN",location=(2,-4,5)); bpy.context.object.data.energy=4
bpy.ops.object.light_add(type="AREA",location=(-3,-2,3)); bpy.context.object.data.energy=200; bpy.context.object.data.size=8
cs=[]
for o in keep:
    mn,mx=bbox(o); cs += [mn,mx]
allmn=np.min(cs,0); allmx=np.max(cs,0); ctr=(allmn+allmx)/2; M=float((allmx-allmn).max())
s=bpy.context.scene; s.render.engine="CYCLES"; s.cycles.samples=40; s.cycles.use_denoising=True
s.view_settings.view_transform="Standard"; s.render.resolution_x=s.render.resolution_y=420; s.render.film_transparent=True
bpy.ops.object.camera_add(location=(ctr[0], ctr[1]-M*3, ctr[2])); cam=bpy.context.object
cam.rotation_euler=(mathutils.Vector(ctr)-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=M*1.3; s.camera=cam
s.render.filepath=os.path.join(OUT,"armor_pieces_front"); bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"armor_pieces.blend"))
print("done extract")
