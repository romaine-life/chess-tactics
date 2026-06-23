import bpy, os, math, mathutils, numpy as np
from bpy_extras.object_utils import world_to_camera_view
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\frontend\public\assets\units\bishop\blender-render-mitre"
PROOF = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\bishop-proof"
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
bishop = bpy.data.objects["bishop"]; mitre = bpy.data.objects["MITRE"]

rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
for o in (bishop, mitre):
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

# the workspace's active camera is the front (numpad-1) cam from fit_mitre — replace
# it with a fresh contract camera so we render the true-isometric angle.
for c in [o for o in scene.objects if o.type == "CAMERA"]:
    bpy.data.objects.remove(c, do_unlink=True)
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E)*D/math.sqrt(2)
bpy.ops.object.camera_add(); cam = bpy.context.object; scene.camera = cam
cam.location = (comp, -comp, 1.0 + math.sin(E)*D)
cam.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.7

scene.render.engine = "CYCLES"; scene.cycles.samples = 48; scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = scene.render.resolution_y = 512; scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
DIRECTIONS = {"south":0,"south-west":-45,"west":-90,"north-west":-135,"north":180,"north-east":135,"east":90,"south-east":45}
for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print("rendered", name)
rig.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
v = world_to_camera_view(scene, scene.camera, mathutils.Vector((0, 0, 0)))
print("ANCHOR  unitAnchorX=%.3f%%  unitAnchorY=%.3f%%" % (v.x*100, (1-v.y)*100))
img = bpy.data.images.load(os.path.join(OUT, "south.png")); w, h = img.size
a = (np.array(img.pixels[:]).reshape(h, w, 4)[::-1][:, :, 3] > 0.5)
ys = np.where(a.any(1))[0]; lo = int(ys.min()+0.55*(ys.max()-ys.min()))
widths = np.array([(np.where(a[y])[0].max()-np.where(a[y])[0].min()+1) if a[y].any() else 0 for y in range(h)])
print("FOOTPRINT %dpx" % widths[lo:].max())
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PROOF, "bishop_mitre.blend"))
print("BISHOP_DONE ->", OUT)
