import bpy, math, mathutils, os, numpy as np, glob
MITRE = glob.glob(os.path.join(os.environ["TEMP"], "mitre_extract", "**", "*.obj"), recursive=True)[0]
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\bishop-proof"
# tunables (first pass)
WIDTH_FACTOR = 1.30   # mitre width / bishop head width
BAND_Z       = 1.40   # z of the mitre band bottom (sits down over the ball head)

scene = bpy.context.scene
bishop = next(o for o in scene.objects if o.name == "bishop")
n=len(bishop.data.vertices); a=np.empty(n*3); bishop.data.vertices.foreach_get("co",a); bc=a.reshape(-1,3)
# bishop "head" = top region; the head top where the mitre sits
head = bc[bc[:,2] > 1.45]
head_w = 2*np.sqrt(head[:,0]**2 + head[:,1]**2).max()
head_top = bc[:,2].max()
print("bishop head width=%.3f top_z=%.3f" % (head_w, head_top))

# import mitre, orient + fit
before = set(scene.objects)
bpy.ops.wm.obj_import(filepath=MITRE)
ms=[o for o in scene.objects if o not in before and o.type=="MESH"]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active=ms[0]
if len(ms)>1: bpy.ops.object.join()
mi=bpy.context.view_layer.objects.active; mi.name="MITRE"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def mco():
    a=np.empty(len(mi.data.vertices)*3); mi.data.vertices.foreach_get("co",a); return a.reshape(-1,3)
c=mco(); dims=c.max(0)-c.min(0)
# stand the mitre upright: its longest axis -> Z (point up)
up=int(np.argmax(dims))
if up==0: mi.rotation_euler=(0,math.radians(-90),0)
elif up==1: mi.rotation_euler=(math.radians(90),0,0)
bpy.ops.object.transform_apply(rotation=True)
# wider end (opening for the head) at the BOTTOM
c=mco(); zr=c[:,2].max()-c[:,2].min()
spread=lambda p: np.sqrt(((p[:,:2]-p[:,:2].mean(0))**2).sum(1)).mean()
if spread(c[c[:,2]>c[:,2].max()-0.25*zr]) > spread(c[c[:,2]<c[:,2].min()+0.25*zr]):
    mi.rotation_euler=(math.radians(180),0,0); bpy.ops.object.transform_apply(rotation=True)
# scale to head width, seat band on the head
c=mco(); mn=c.min(0); mx=c.max(0); mw=max(mx[0]-mn[0], mx[1]-mn[1]); s=(WIDTH_FACTOR*head_w)/mw; ctr=(mn+mx)/2
mi.location=(-ctr[0]*s,-ctr[1]*s,0); mi.scale=(s,s,s); bpy.ops.object.transform_apply(location=True, scale=True)
c=mco(); cxy=(c.min(0)+c.max(0))/2
mi.location=(-cxy[0], -cxy[1], BAND_Z - c.min(0)[2])   # band down over the ball head
bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("navy stone"); m.use_nodes=True
b=m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value=(0.035,0.075,0.140,1); b.inputs["Roughness"].default_value=0.82
mi.data.materials.clear(); mi.data.materials.append(m)
scene.render.filepath=os.path.join(OUT,"bishop_mitre_south")
bpy.ops.render.render(write_still=True)
bpy.ops.object.camera_add(location=(0,-5,1.0)); fc=bpy.context.object
fc.rotation_euler=(mathutils.Vector((0,0,1.0))-fc.location).to_track_quat("-Z","Y").to_euler()
fc.data.type="ORTHO"; fc.data.ortho_scale=2.7; scene.camera=fc
scene.render.filepath=os.path.join(OUT,"bishop_mitre_front")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"bishop_mitre_workspace.blend"))
print("rendered bishop_mitre south + front; saved workspace")
