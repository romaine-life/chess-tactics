import bpy, math, mathutils, os, numpy as np
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
scene = bpy.context.scene

def bbox(o):
    a=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get("co",a); c=a.reshape(-1,3)
    return c.min(0), c.max(0)

meshes=[o for o in scene.objects if o.type=="MESH"]
# rename by material + x position
for o in meshes:
    mn = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else "?"
    cx = (bbox(o)[0][0]+bbox(o)[1][0])/2
    o.name = {"helmet":"HELMET","plume":"PLUME","cloth":"CAPE"}.get(mn, ("PAULDRON_L" if cx<0 else "PAULDRON_R"))
print("pieces:", [o.name for o in meshes])

# lighting once
w=scene.world or bpy.data.worlds.new("W"); scene.world=w; w.use_nodes=True
w.node_tree.nodes.get("Background").inputs["Strength"].default_value=0.6
bpy.ops.object.light_add(type="SUN",location=(2,-4,5)); bpy.context.object.data.energy=4.5
bpy.ops.object.light_add(type="AREA",location=(-3,-2,3)); bpy.context.object.data.energy=200; bpy.context.object.data.size=8
scene.render.engine="CYCLES"; scene.cycles.samples=40; scene.cycles.use_denoising=True
scene.view_settings.view_transform="Standard"; scene.render.resolution_x=scene.render.resolution_y=360; scene.render.film_transparent=True
bpy.ops.object.camera_add(); cam=bpy.context.object; cam.data.type="ORTHO"; scene.camera=cam

for piece in meshes:
    for o in meshes: o.hide_render = (o is not piece)
    mn,mx=bbox(piece); ctr=(mn+mx)/2; M=float((mx-mn).max())
    cam.location=(ctr[0], ctr[1]-M*3, ctr[2])
    cam.rotation_euler=(mathutils.Vector(ctr)-cam.location).to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale=M*1.35
    scene.render.filepath=os.path.join(OUT,"piece_"+piece.name)
    bpy.ops.render.render(write_still=True)
    print("rendered", piece.name)
for o in meshes: o.hide_render=False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"armor_pieces.blend"))
print("done")
