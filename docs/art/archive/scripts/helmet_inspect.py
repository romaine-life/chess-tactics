import bpy, math, mathutils, os, numpy as np
DAE = os.path.join(os.environ["TEMP"], "helmet_extract", "source", "model", "model", "model.dae")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"

bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
bpy.ops.wm.collada_import(filepath=DAE)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
print("=== imported objects ===")
for o in bpy.context.scene.objects:
    print("  %-20s type=%-7s dims=(%.2f,%.2f,%.2f)" % (o.name, o.type, o.dimensions.x, o.dimensions.y, o.dimensions.z))
# join meshes, bake transforms
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
h = bpy.context.view_layer.objects.active; h.name = "helmet"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
n=len(h.data.vertices); a=np.empty(n*3); h.data.vertices.foreach_get("co",a); co=a.reshape(-1,3)
dims=co.max(0)-co.min(0); ctr=(co.max(0)+co.min(0))/2
print("helmet bbox dims x=%.3f y=%.3f z=%.3f" % tuple(dims))
# center + scale to ~2 for clear viewing
h.location=(-ctr[0],-ctr[1],-ctr[2]); s=2.0/max(dims)
h.scale=(s,s,s); bpy.ops.object.transform_apply(location=True, scale=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("flat"); m.use_nodes=True
m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(0.3,0.45,0.7,1)
h.data.materials.clear(); h.data.materials.append(m)
bpy.ops.object.light_add(type="SUN",location=(2,-3,4)); bpy.context.object.data.energy=4
s=bpy.context.scene; s.render.engine="BLENDER_EEVEE"; s.render.film_transparent=True
s.render.resolution_x=s.render.resolution_y=320
def cam(loc,rot,name):
    bpy.ops.object.camera_add(location=loc,rotation=rot); c=bpy.context.object
    c.data.type="ORTHO"; c.data.ortho_scale=2.6; s.camera=c
    s.render.filepath=os.path.join(OUT,name); bpy.ops.render.render(write_still=True)
cam((0,-4,0),(math.radians(90),0,0),"helmet_FRONT")     # looking +Y (numpad 1 front)
cam((0,0,5),(0,0,0),"helmet_TOP")                       # looking down -Z
cam((4,0,0),(math.radians(90),0,math.radians(90)),"helmet_SIDE")  # looking -X
print("done helmet inspect")
