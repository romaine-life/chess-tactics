import bpy, math, mathutils, os, numpy as np
GLB = os.path.join(os.environ["TEMP"], "king2_extract", "source", "chess.glb")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(c):
        if b.users == 0: c.remove(b)
bpy.ops.import_scene.gltf(filepath=GLB)
ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.name = "king"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("verts:", len(ob.data.vertices))
def co():
    a=np.empty(len(ob.data.vertices)*3); ob.data.vertices.foreach_get("co",a); return a.reshape(-1,3)
c=co(); print("import dims x=%.2f y=%.2f z=%.2f" % tuple(c.max(0)-c.min(0)))
up=int(np.argmax(c.max(0)-c.min(0)))
if up==0: ob.rotation_euler=(0,math.radians(-90),0)
elif up==1: ob.rotation_euler=(math.radians(90),0,0)
bpy.ops.object.transform_apply(rotation=True)
c=co(); zr=c[:,2].max()-c[:,2].min()
spread=lambda p: np.sqrt(((p[:,:2]-p[:,:2].mean(0))**2).sum(1)).mean()
if spread(c[c[:,2]>c[:,2].max()-0.2*zr]) > spread(c[c[:,2]<c[:,2].min()+0.2*zr]):
    ob.rotation_euler=(math.radians(180),0,0); bpy.ops.object.transform_apply(rotation=True)
c=co(); mn=c.min(0); mx=c.max(0); s=2.0/(mx[2]-mn[2])
ob.scale=(s,s,s); bpy.ops.object.transform_apply(scale=True)
c=co(); mn=c.min(0); mx=c.max(0)
ob.location=(-(mn[0]+mx[0])/2,-(mn[1]+mx[1])/2,-mn[2]); bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("navy stone"); m.use_nodes=True
b=m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value=(0.035,0.075,0.140,1); b.inputs["Roughness"].default_value=0.82
ob.data.materials.clear(); ob.data.materials.append(m)
s=bpy.context.scene
w=bpy.data.worlds.new("W"); s.world=w; w.use_nodes=True
bg=w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.02,0.03,0.05,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN",location=(-3,-4,8)); k=bpy.context.object
k.rotation_euler=(math.radians(50),0,math.radians(-38)); k.data.energy=3.0; k.data.color=(0.85,0.92,1.0)
bpy.ops.object.light_add(type="AREA",location=(3.5,-3,3)); bpy.context.object.data.energy=130; bpy.context.object.data.size=6; bpy.context.object.data.color=(0.7,0.78,1.0)
bpy.ops.object.light_add(type="AREA",location=(-2,4,4.5)); bpy.context.object.data.energy=80; bpy.context.object.data.size=4; bpy.context.object.data.color=(0.55,0.7,1.0)
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; s.camera=cam
cam.location=(comp,-comp,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7
s.render.engine="CYCLES"; s.cycles.samples=44; s.cycles.use_denoising=True
s.view_settings.view_transform="Standard"
s.render.resolution_x=s.render.resolution_y=512; s.render.film_transparent=True
s.render.image_settings.file_format="PNG"; s.render.filepath=os.path.join(OUT,"king2_south")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"king_base.blend"))
print("rendered king2_south.png")
