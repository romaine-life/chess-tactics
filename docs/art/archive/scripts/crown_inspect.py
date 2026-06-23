import bpy, math, mathutils, os, numpy as np
FBX = os.path.join(os.environ["TEMP"], "crown_extract", "source", "Kings Crown Sketchfab.fbx")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=FBX)
ms=[o for o in bpy.context.scene.objects if o.type=="MESH"]
print("imported meshes:", len(ms), [round(o.dimensions.z,2) for o in ms][:6])
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active=ms[0]
if len(ms)>1: bpy.ops.object.join()
c=bpy.context.view_layer.objects.active; c.name="crown"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
n=len(c.data.vertices); a=np.empty(n*3); c.data.vertices.foreach_get("co",a); co=a.reshape(-1,3)
dims=co.max(0)-co.min(0); ctr=(co.max(0)+co.min(0))/2
print("crown verts=%d dims x=%.3f y=%.3f z=%.3f" % (n, dims[0],dims[1],dims[2]))
c.location=(-ctr[0],-ctr[1],-ctr[2]); sc=2.0/max(dims); c.scale=(sc,sc,sc)
bpy.ops.object.transform_apply(location=True, scale=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("flat"); m.use_nodes=True
m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(0.3,0.45,0.7,1)
c.data.materials.clear(); c.data.materials.append(m)
bpy.ops.object.light_add(type="SUN",location=(2,-3,4)); bpy.context.object.data.energy=4
s=bpy.context.scene; s.render.engine="BLENDER_EEVEE"; s.render.film_transparent=True
s.render.resolution_x=s.render.resolution_y=320
def cam(loc,rot,name):
    bpy.ops.object.camera_add(location=loc,rotation=rot); cc=bpy.context.object
    cc.data.type="ORTHO"; cc.data.ortho_scale=2.6; s.camera=cc
    s.render.filepath=os.path.join(OUT,name); bpy.ops.render.render(write_still=True)
cam((0,-4,0),(math.radians(90),0,0),"crown_FRONT")
cam((0,0,5),(0,0,0),"crown_TOP")
cam((4,0,0),(math.radians(90),0,math.radians(90)),"crown_SIDE")
print("done crown inspect")
