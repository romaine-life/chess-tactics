import bpy, math, mathutils, sys, os
a=sys.argv[sys.argv.index("--")+1:]; BASE=a[0]; OUT=a[1]
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes,bpy.data.materials,bpy.data.lights,bpy.data.cameras,bpy.data.worlds,bpy.data.images):
    for b in list(c):
        if getattr(b,'users',0)==0: c.remove(b)
bpy.ops.mesh.primitive_cube_add(size=1.0); ob=bpy.context.object
ob.scale=(0.5,0.5,0.42); bpy.ops.object.transform_apply(scale=True)
me=ob.data; topz=max(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z-=topz
bpy.ops.object.shade_flat()
bev=ob.modifiers.new("b","BEVEL"); bev.width=0.01; bev.segments=2
img=bpy.data.images.load(BASE)
def m_top():
    m=bpy.data.materials.new("top"); m.use_nodes=True; nt=m.node_tree; b=nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value=0.9
    t=nt.nodes.new("ShaderNodeTexImage"); t.image=img; nt.links.new(t.outputs["Color"],b.inputs["Base Color"]); return m
def m_side():
    m=bpy.data.materials.new("side"); m.use_nodes=True; nt=m.node_tree; b=nt.nodes.get("Principled BSDF")
    b.inputs["Roughness"].default_value=0.92
    t=nt.nodes.new("ShaderNodeTexImage"); t.image=img
    mix=nt.nodes.new("ShaderNodeMixRGB"); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1.0; mix.inputs[2].default_value=(0.32,0.34,0.42,1)
    nt.links.new(t.outputs["Color"],mix.inputs[1]); nt.links.new(mix.outputs["Color"],b.inputs["Base Color"]); return m
ob.data.materials.append(m_top()); ob.data.materials.append(m_side())
for poly in me.polygons: poly.material_index=0 if poly.normal.z>0.5 else 1
# unwrap: top face full texture
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.cube_project(cube_size=1.0); bpy.ops.object.mode_set(mode='OBJECT')
sc=bpy.context.scene; w=bpy.data.worlds.new("W"); sc.world=w; w.use_nodes=True
bg=w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.03,0.04,0.06,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN"); k=bpy.context.object
k.rotation_euler=(math.radians(48),math.radians(8),math.radians(-42)); k.data.energy=3.6; k.data.color=(1.0,0.98,0.94)
bpy.ops.object.light_add(type="AREA",location=(3.5,-3,3)); f=bpy.context.object; f.data.energy=70; f.data.size=7; f.data.color=(0.65,0.74,1.0)
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam
cam.location=(comp,-comp,math.sin(E)*D-0.22); cam.rotation_euler=(mathutils.Vector((0,0,-0.22))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=1.5
sc.render.engine="CYCLES"; sc.cycles.samples=64; sc.cycles.use_denoising=True
sc.view_settings.view_transform="Standard"
sc.render.resolution_x=192; sc.render.resolution_y=280; sc.render.film_transparent=True
sc.render.image_settings.file_format="PNG"; sc.render.filepath=OUT
bpy.ops.render.render(write_still=True); print("DONE",os.path.basename(OUT))
