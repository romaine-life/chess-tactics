import bpy, os, math, mathutils, numpy as np
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
scene = bpy.context.scene

# remove cape + helmet
for nm in ("CAPE", "HELMET"):
    o = bpy.data.objects.get(nm)
    if o: bpy.data.objects.remove(o, do_unlink=True)

king = bpy.data.objects["king"]
v=np.empty(len(king.data.vertices)*3); king.data.vertices.foreach_get("co",v); kc=v.reshape(-1,3)
band = kc[(kc[:,2] > 1.00) & (kc[:,2] < 1.30)]
half_w = np.abs(band[:,0]).max()
SH_Z = 1.15; TH = 0.50    # shoulder height, pauldron target height
print("king shoulder half-width=%.3f at z~%.2f" % (half_w, SH_Z))

for nm, side in (("PAULDRON_L", -1), ("PAULDRON_R", 1)):
    o = bpy.data.objects.get(nm)
    if not o: continue
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    b=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get("co",b); bc=b.reshape(-1,3)
    c=(bc.min(0)+bc.max(0))/2; h=bc.max(0)[2]-bc.min(0)[2]; s=TH/h
    o.scale=(s,s,s)
    o.location=(side*(half_w+0.04) - s*c[0], -s*c[1], SH_Z - s*c[2])

# render a first-pass south view
scene.render.engine="CYCLES"; scene.cycles.samples=40; scene.cycles.use_denoising=True
scene.view_settings.view_transform="Standard"
scene.render.resolution_x=scene.render.resolution_y=512; scene.render.film_transparent=True
scene.render.filepath=os.path.join(OUT,"king_pauldrons_south")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile()   # overwrite the workspace in place
print("done pauldrons first pass")
