import bpy, math, mathutils, sys, numpy as np
a=sys.argv[sys.argv.index("--")+1:]
BASE=a[0]; OUT=a[1]; ORTHO=float(a[2]); ZS=float(a[3]); TZ=float(a[4])
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes,bpy.data.materials,bpy.data.lights,bpy.data.cameras,bpy.data.worlds,bpy.data.images):
    for b in list(c):
        if getattr(b,'users',0)==0: c.remove(b)
bpy.ops.mesh.primitive_cube_add(size=1.0); ob=bpy.context.object
ob.scale=(0.5,0.5,ZS); bpy.ops.object.transform_apply(scale=True)
me=ob.data; topz=max(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z-=topz
bpy.ops.object.shade_flat()
img=bpy.data.images.load(BASE)
m=bpy.data.materials.new("t"); m.use_nodes=True; t=m.node_tree.nodes.new("ShaderNodeTexImage"); t.image=img
m.node_tree.links.new(t.outputs["Color"],m.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
m.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=0.9
ms=bpy.data.materials.new("s"); ms.use_nodes=True; ts=ms.node_tree.nodes.new("ShaderNodeTexImage"); ts.image=img
mix=ms.node_tree.nodes.new("ShaderNodeMixRGB"); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1; mix.inputs[2].default_value=(0.32,0.34,0.42,1)
ms.node_tree.links.new(ts.outputs["Color"],mix.inputs[1]); ms.node_tree.links.new(mix.outputs["Color"],ms.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])
ob.data.materials.append(m); ob.data.materials.append(ms)
for p in me.polygons: p.material_index=0 if p.normal.z>0.5 else 1
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
sc=bpy.context.scene; w=bpy.data.worlds.new("W"); sc.world=w; w.use_nodes=True
bg=w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.03,0.04,0.06,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN"); k=bpy.context.object
k.rotation_euler=(math.radians(48),math.radians(8),math.radians(-42)); k.data.energy=3.6; k.data.color=(1,.98,.94)
bpy.ops.object.light_add(type="AREA",location=(3.5,-3,3)); bpy.context.object.data.energy=70; bpy.context.object.data.size=7; bpy.context.object.data.color=(.65,.74,1)
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam
cam.location=(comp,-comp,math.sin(E)*D+TZ); cam.rotation_euler=(mathutils.Vector((0,0,TZ))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=ORTHO
sc.render.engine="CYCLES"; sc.cycles.samples=24; sc.cycles.use_denoising=True
sc.view_settings.view_transform="Standard"
sc.render.resolution_x=96; sc.render.resolution_y=140; sc.render.film_transparent=True
sc.render.image_settings.file_format="PNG"; sc.render.filepath=OUT
bpy.ops.render.render(write_still=True)
im=bpy.data.images.load(OUT+".png" if not OUT.endswith(".png") else OUT); W,H=im.size
arr=np.array(im.pixels[:]).reshape(H,W,4)[::-1][:,:,3]>0.4
rows=np.where(arr.any(1))[0]; widths=np.array([(np.where(arr[y])[0].max()-np.where(arr[y])[0].min()+1) if arr[y].any() else 0 for y in range(H)])
print("CAL ortho=%.2f zs=%.2f tz=%.2f -> top=%d bottom=%d width=%d eq_y=%d" % (ORTHO,ZS,TZ,rows.min(),rows.max(),widths.max(),int(np.argmax(widths))))
