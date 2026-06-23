import bpy, bmesh, math, mathutils, os
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"
os.makedirs(OUT, exist_ok=True)

# fresh scene
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(c):
        if b.users == 0: c.remove(b)

# Staunton pawn profile (radius, z) bottom-center -> top-center of the ball.
PROFILE = [
    (0.000, 0.000), (0.580, 0.000), (0.600, 0.045), (0.560, 0.100), (0.400, 0.140),
    (0.340, 0.200), (0.400, 0.255), (0.330, 0.320), (0.220, 0.460), (0.168, 0.620),
    (0.166, 0.700), (0.205, 0.780), (0.300, 0.860), (0.235, 0.930), (0.180, 0.990),
    (0.215, 1.060), (0.300, 1.140), (0.330, 1.270), (0.300, 1.400), (0.215, 1.480),
    (0.000, 1.555),
]
me = bpy.data.meshes.new("pawn"); ob = bpy.data.objects.new("pawn", me)
bpy.context.collection.objects.link(ob)
bm = bmesh.new()
vs = [bm.verts.new((r, 0.0, z)) for (r, z) in PROFILE]
for a, b in zip(vs, vs[1:]):
    bm.edges.new((a, b))
bm.to_mesh(me); bm.free()
# revolve
scr = ob.modifiers.new("screw", "SCREW"); scr.axis = "Z"; scr.angle = math.radians(360); scr.steps = 96; scr.render_steps = 96
scr.use_merge_vertices = True; scr.merge_threshold = 0.0005
bpy.context.view_layer.objects.active = ob
bpy.ops.object.modifier_apply(modifier="screw")
bpy.ops.object.shade_smooth()
# clean doubles + recalc
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()

# navy stone material (grey base lit cool -> navy, like the rook/pawn family)
m = bpy.data.materials.new("navy stone"); m.use_nodes = True
bsdf = m.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.035, 0.075, 0.140, 1)  # dark navy (concept), lit cool
bsdf.inputs["Roughness"].default_value = 0.82
me.materials.append(m)

# world + cool lighting (match roster)
w = bpy.data.worlds.new("W"); bpy.context.scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get("Background"); bg.inputs["Color"].default_value=(0.02,0.03,0.05,1); bg.inputs["Strength"].default_value=0.35
bpy.ops.object.light_add(type="SUN", location=(-3,-4,8)); k=bpy.context.object
k.rotation_euler=(math.radians(50),0,math.radians(-38)); k.data.energy=3.0; k.data.color=(0.85,0.92,1.0)
bpy.ops.object.light_add(type="AREA", location=(3.5,-3,3)); bpy.context.object.data.energy=130; bpy.context.object.data.size=6; bpy.context.object.data.color=(0.7,0.78,1.0)
bpy.ops.object.light_add(type="AREA", location=(-2,4,4.5)); bpy.context.object.data.energy=80; bpy.context.object.data.size=4; bpy.context.object.data.color=(0.55,0.7,1.0)

s = bpy.context.scene
E=math.radians(35.264389682754654); D=5.0; comp=math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam=bpy.context.object; s.camera=cam
cam.location=(comp,-comp,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7
s.render.engine="CYCLES"; s.cycles.samples=48; s.cycles.use_denoising=True
s.view_settings.view_transform="Standard"
s.render.resolution_x=s.render.resolution_y=512; s.render.film_transparent=True
s.render.image_settings.file_format="PNG"; s.render.filepath=os.path.join(OUT,"pawn_gen_south")
bpy.ops.render.render(write_still=True)
# save the pawn for the next step (helmet fitting)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "pawn_base.blend"))
print("ball center z ~1.27, radius ~0.33; rendered pawn_gen_south.png")
