import bpy, math, mathutils, os, glob, numpy as np
EX=os.path.join(os.environ["TEMP"],"tiles_ex")
OBJ=glob.glob(os.path.join(EX,"grass-02","inner","*.obj"))[0]
GTEX=os.path.join(EX,"grass-02","inner","2023-11-27T110445Z.png")
DIRT=os.path.join(EX,"simple-grass-chunks","textures","ground_close_04_basecolor.jpeg")
OUT=os.path.join(os.environ["TEMP"],"grass_test","grass-standing.png")
os.makedirs(os.path.dirname(OUT),exist_ok=True)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes,bpy.data.materials,bpy.data.lights,bpy.data.cameras,bpy.data.worlds,bpy.data.images):
    for b in list(c):
        if getattr(b,'users',0)==0: c.remove(b)
# soil block (tile)
bpy.ops.mesh.primitive_cube_add(size=1.0); blk=bpy.context.object; blk.scale=(0.5,0.5,0.79); bpy.ops.object.transform_apply(scale=True)
for v in blk.data.vertices: v.co.z-=max(vv.co.z for vv in blk.data.vertices)
bpy.ops.object.shade_flat()
di=bpy.data.images.load(DIRT)
mt=bpy.data.materials.new("soil"); mt.use_nodes=True; t=mt.node_tree.nodes.new("ShaderNodeTexImage"); t.image=di
mt.node_tree.links.new(t.outputs["Color"],mt.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
ms=bpy.data.materials.new("side"); ms.use_nodes=True; ts=ms.node_tree.nodes.new("ShaderNodeTexImage"); ts.image=di
mix=ms.node_tree.nodes.new("ShaderNodeMixRGB"); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1; mix.inputs[2].default_value=(0.3,0.3,0.35,1)
ms.node_tree.links.new(ts.outputs["Color"],mix.inputs[1]); ms.node_tree.links.new(mix.outputs["Color"],ms.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
blk.data.materials.append(mt); blk.data.materials.append(ms)
for p in blk.data.polygons: p.material_index=0 if p.normal.z>0.5 else 1
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
# grass tuft prototype
bpy.ops.wm.obj_import(filepath=OBJ)
gs=[o for o in bpy.context.scene.objects if o.type=="MESH" and o!=blk]
for o in gs: o.select_set(True)
bpy.context.view_layer.objects.active=gs[0]
if len(gs)>1: bpy.ops.object.join()
g=bpy.context.view_layer.objects.active; g.name="grass"
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
g.rotation_euler=(math.radians(90),0,0); bpy.ops.object.transform_apply(rotation=True)  # Y-up -> Z-up
a=np.empty(len(g.data.vertices)*3); g.data.vertices.foreach_get("co",a); c=a.reshape(-1,3)
s=0.34/(c[:,2].max()-c[:,2].min()); g.scale=(s,s,s); bpy.ops.object.transform_apply(scale=True)
c=np.array([v.co for v in g.data.vertices]); g.location=(-(c[:,0].min()+c[:,0].max())/2,-(c[:,1].min()+c[:,1].max())/2,-c[:,2].min()); bpy.ops.object.transform_apply(location=True)
# alpha grass material
gt=bpy.data.images.load(GTEX); 
gm=bpy.data.materials.new("grass"); gm.use_nodes=True; b=gm.node_tree.nodes.get("Principled BSDF"); b.inputs["Roughness"].default_value=0.9
tg=gm.node_tree.nodes.new("ShaderNodeTexImage"); tg.image=gt
gm.node_tree.links.new(tg.outputs["Color"],b.inputs["Base Color"]); agt=gm.node_tree.nodes.new("ShaderNodeMath"); agt.operation="GREATER_THAN"; agt.inputs[1].default_value=0.35; gm.node_tree.links.new(tg.outputs["Alpha"],agt.inputs[0]); gm.node_tree.links.new(agt.outputs["Value"],b.inputs["Alpha"]); b.inputs["Specular IOR Level"].default_value=0.1
g.data.materials.clear(); g.data.materials.append(gm)
# scatter tufts on the top
import random
rng=[(0.0,0.0),(-0.18,0.1),(0.16,-0.05),(-0.1,-0.16),(0.12,0.16),(0.0,0.18),(-0.2,-0.05),(0.2,0.08),(0.05,-0.18)]
for i,(x,y) in enumerate(rng):
    d=g if i==0 else g.copy()
    if i>0: d.data=g.data.copy(); bpy.context.collection.objects.link(d)
    d.location=(x,y,0); d.rotation_euler=(0,0,(i*40)%360*math.pi/180); sc=0.8+0.4*((i*7)%5)/5; d.scale=(sc,sc,sc)
# scene + iso cam (taller frame to see grass)
sc=bpy.context.scene; w=bpy.data.worlds.new("W"); sc.world=w; w.use_nodes=True
w.node_tree.nodes.get("Background").inputs["Color"].default_value=(0.03,0.04,0.06,1); w.node_tree.nodes.get("Background").inputs["Strength"].default_value=0.4
bpy.ops.object.light_add(type="SUN"); k=bpy.context.object; k.rotation_euler=(math.radians(48),math.radians(8),math.radians(-42)); k.data.energy=3.6; k.data.color=(1,.99,.95)
bpy.ops.object.light_add(type="AREA",location=(3.5,-3,3)); bpy.context.object.data.energy=80; bpy.context.object.data.size=7; bpy.context.object.data.color=(.7,.78,1)
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam
cam.location=(comp,-comp,math.sin(E)*D); cam.rotation_euler=(mathutils.Vector((0,0,0.1))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=1.7
sc.render.engine="CYCLES"; sc.cycles.samples=48; sc.cycles.use_denoising=True
sc.view_settings.view_transform="Standard"; sc.render.resolution_x=220; sc.render.resolution_y=300; sc.render.film_transparent=True
sc.render.image_settings.file_format="PNG"; sc.render.filepath=OUT
bpy.ops.render.render(write_still=True); print("GRASS_TILE_DONE")
