"""Render the 8-direction tiaraed queen from the hand-assembled source.

Run with:  blender --background --python render_queen_tiara.py

The tiara was hand-fitted onto the queen's crown collar in Blender, so the source of truth
is the assembled `queen_tiara.blend` (navy Staunton queen + jeweled gold tiara FBX,
positioned, rigged to an empty, true-isometric contract camera baked in). This opens it,
renders the 8 directions, and prints the seating anchor.
Output -> .unit-art-output/queen/navy-blue/<direction>.png

The tiara's front gives the queen a per-direction facing (front -> game-south at yaw 0).
"""
import bpy, os, math, mathutils, numpy as np
from bpy_extras.object_utils import world_to_camera_view
from pathlib import Path

ROOT = Path(__file__).resolve().parent
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
BLEND = str(ROOT / "docs/art/unit-concepts/blender-units/queen-tiara/queen_tiara.blend")
OUT = str(ROOT / ".unit-art-output/queen/navy-blue")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
rig = bpy.data.objects.get("rig")
if rig is None:
    rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
    for o in bpy.data.objects:
        if o.type == "MESH":
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
print("QUEEN_DONE ->", OUT)
