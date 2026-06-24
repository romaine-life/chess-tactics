import bpy, os, sys, math, mathutils, numpy as np
# args: MODEL OUTDIR TARGET_MAXDIM MATMODE(keep|stone)
a = sys.argv[sys.argv.index("--")+1:]
MODEL, OUT, TARGET, MAT = a[0], a[1], float(a[2]), a[3]
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
    for b in list(c):
        if getattr(b, "users", 0) == 0: c.remove(b)
ext = os.path.splitext(MODEL)[1].lower()
if ext == ".glb" or ext == ".gltf": bpy.ops.import_scene.gltf(filepath=MODEL)
elif ext == ".fbx": bpy.ops.import_scene.fbx(filepath=MODEL)
elif ext == ".obj": bpy.ops.wm.obj_import(filepath=MODEL)
ms = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active = ms[0]
if len(ms) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.name = "rock"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def co():
    n=len(ob.data.vertices); arr=np.empty(n*3); ob.data.vertices.foreach_get("co",arr); return arr.reshape(-1,3)
c=co(); dims=c.max(0)-c.min(0); print("import dims x=%.2f y=%.2f z=%.2f" % tuple(dims))
s = TARGET / max(dims)
ob.scale=(s,s,s); bpy.ops.object.transform_apply(scale=True)
c=co(); mn=c.min(0); mx=c.max(0)
ob.location=(-(mn[0]+mx[0])/2, -(mn[1]+mx[1])/2, -mn[2]); bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
if MAT == "stone":
    m=bpy.data.materials.new("rock stone"); m.use_nodes=True
    b=m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value=(0.17,0.18,0.20,1); b.inputs["Roughness"].default_value=0.93
    ob.data.materials.clear(); ob.data.materials.append(m)
# scene: world + lights + contract camera (matches units)
sc=bpy.context.scene
w=bpy.data.worlds.new("W"); sc.world=w; w.use_nodes=True
bg=w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.02,0.03,0.05,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN",location=(-3,-4,8)); k=bpy.context.object
k.rotation_euler=(math.radians(50),0,math.radians(-38)); k.data.energy=3.0; k.data.color=(0.85,0.92,1.0)
bpy.ops.object.light_add(type="AREA",location=(3.5,-3,3)); bpy.context.object.data.energy=130; bpy.context.object.data.size=6; bpy.context.object.data.color=(0.7,0.78,1.0)
bpy.ops.object.light_add(type="AREA",location=(-2,4,4.5)); bpy.context.object.data.energy=80; bpy.context.object.data.size=4; bpy.context.object.data.color=(0.55,0.7,1.0)
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam
cam.location=(comp,-comp,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7
sc.render.engine="CYCLES"; sc.cycles.samples=44; sc.cycles.use_denoising=True
sc.view_settings.view_transform="Standard"
sc.render.resolution_x=sc.render.resolution_y=512; sc.render.film_transparent=True
sc.render.image_settings.file_format="PNG"
rig=bpy.data.objects.new("rig",None); sc.collection.objects.link(rig)
ob.parent=rig; ob.matrix_parent_inverse=rig.matrix_world.inverted()
DIRS={"south":0,"south-west":-45,"west":-90,"north-west":-135,"north":180,"north-east":135,"east":90,"south-east":45}
for name,ang in DIRS.items():
    rig.rotation_euler=(0,0,math.radians(ang))
    sc.render.filepath=os.path.join(OUT,name); bpy.ops.render.render(write_still=True)
from bpy_extras.object_utils import world_to_camera_view
rig.rotation_euler=(0,0,0); bpy.context.view_layer.update()
v=world_to_camera_view(sc,cam,mathutils.Vector((0,0,0)))
print("ANCHOR x=%.3f%% y=%.3f%%" % (v.x*100,(1-v.y)*100))
print("ROCK_DONE", OUT)
