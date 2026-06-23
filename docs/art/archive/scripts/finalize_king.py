import bpy, os, math, mathutils, numpy as np
from bpy_extras.object_utils import world_to_camera_view
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\frontend\public\assets\units\king\blender-render-crown"
PROOF = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
king = bpy.data.objects["king"]; crown = bpy.data.objects["CROWN"]

# rig both to an empty at origin for the turntable
rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
for o in (king, crown):
    o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

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

# footprint = max projected base width from south
img = bpy.data.images.load(os.path.join(OUT, "south.png")); w, h = img.size
a = (np.array(img.pixels[:]).reshape(h, w, 4)[::-1][:, :, 3] > 0.5)
ys = np.where(a.any(1))[0]; lo = int(ys.min()+0.55*(ys.max()-ys.min()))
widths = np.array([(np.where(a[y])[0].max()-np.where(a[y])[0].min()+1) if a[y].any() else 0 for y in range(h)])
print("FOOTPRINT %dpx" % widths[lo:].max())
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PROOF, "king_crown.blend"))
print("KING_DONE ->", OUT)
