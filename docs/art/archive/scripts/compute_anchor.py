import bpy, math, mathutils
from bpy_extras.object_utils import world_to_camera_view

# exact render camera from render_knight_fur.py
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2)
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 512
bpy.ops.object.camera_add(); cam = bpy.context.object; scene.camera = cam
cam.location = (comp, -comp, 1.0 + math.sin(E) * D)
cam.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.7
bpy.context.view_layer.update()   # evaluate camera matrix before projecting

# ground-contact point = base bottom-center = world origin
v = world_to_camera_view(scene, cam, mathutils.Vector((0, 0, 0)))
anchorX = v.x * 100.0
anchorY = (1.0 - v.y) * 100.0   # image rows are top-down; world_to_camera_view y is bottom-up
print("EXACT anchorX = %.3f%%  (px %.1f)" % (anchorX, v.x * 512))
print("EXACT anchorY = %.3f%%  (px %.1f)" % (anchorY, (1.0 - v.y) * 512))
