"""Open the ORIGINAL web warhorse model (Meshy-AI armored steed) for inspection.

Launch (GUI, not --background):
    blender --python knight_web_view.py
"""

import bpy
from mathutils import Vector

from pathlib import Path

HERE = Path(__file__).resolve().parent
FBX = (HERE / "knight-src" / "source"
       / "Meshy_AI_Armored_Steed_0130151745_texture_fbx"
       / "Meshy_AI_Armored_Steed_0130151745_texture.fbx")

# fresh scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=str(FBX))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
center = (mn + mx) / 2
reach = max(mx - mn)

# world + lights
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.0
bpy.ops.object.light_add(type="SUN", location=(2, -3, 6))
bpy.context.object.data.energy = 3.0

# 3/4 inspection camera
bpy.ops.object.camera_add()
cam = bpy.context.object
bpy.context.scene.camera = cam
cam.location = center + Vector((1, -1.2, 0.55)).normalized() * reach * 2.0
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

# look through the camera, textured shading so the armor maps show
try:
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.region_3d.view_perspective = "CAMERA"
                    space.shading.type = "MATERIAL"
except Exception as exc:
    print("viewport setup skipped:", exc)

print("WEB_KNIGHT_READY")
