"""Render the 8-direction tiaraed queen from the hand-assembled source.

Run with:  blender --background --python render_queen_tiara.py

The tiara was hand-fitted onto the queen's crown collar in Blender, so the source of truth
is the assembled `queen_tiara.blend` (navy Staunton queen + jeweled gold tiara FBX,
positioned, rigged to an empty, true-isometric contract camera baked in). This opens it,
renders the 8 directions, and prints the seating anchor.
The canonical pipeline fetches the private blend into a temporary directory and
supplies UNIT_ART_BLEND, UNIT_ART_OUTPUT_DIR, and frame dimensions. Blender
writes that exact delivery raster without a resize stage.

The tiara's front gives the queen a per-direction facing (front -> game-south at yaw 0).
"""
import bpy, os, math, mathutils, numpy as np
from bpy_extras.object_utils import world_to_camera_view

BLEND = os.environ.get("UNIT_ART_BLEND")
OUT = os.environ.get("UNIT_ART_OUTPUT_DIR")
if not BLEND or not OUT:
    raise RuntimeError("run through generate-unit-art.py; private queen source and output are required")
FRAME_WIDTH = int(os.environ["UNIT_ART_FRAME_WIDTH"])
FRAME_HEIGHT = int(os.environ["UNIT_ART_FRAME_HEIGHT"])
if not (1 <= FRAME_WIDTH <= 4096 and 1 <= FRAME_HEIGHT <= 4096):
    raise RuntimeError("UNIT_ART_FRAME_WIDTH/HEIGHT must be between 1 and 4096")
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene
rig = bpy.data.objects.get("rig")
if rig is None:
    rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

# The assembled blend originally referenced an unpacked temporary texture folder.
# Geometry is the authored source; use one deterministic gold material so a fresh
# checkout never renders Blender's magenta missing-texture error color.
tiara = bpy.data.materials.get("tiara gold")
if tiara is None:
    raise RuntimeError("assembled queen source is missing the 'tiara gold' material")
tiara.use_nodes = True
nodes = tiara.node_tree.nodes; nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
gold = nodes.new("ShaderNodeBsdfPrincipled")
gold.inputs["Base Color"].default_value = (0.42, 0.20, 0.035, 1)
gold.inputs["Metallic"].default_value = 0.78
gold.inputs["Roughness"].default_value = 0.34
tiara.node_tree.links.new(gold.outputs["BSDF"], out.inputs["Surface"])

scene.render.engine = "CYCLES"; scene.cycles.samples = 48; scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = FRAME_WIDTH; scene.render.resolution_y = FRAME_HEIGHT; scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
DIRECTIONS = {"south":0,"south-west":-45,"west":-90,"north-west":-135,"north":180,"north-east":135,"east":90,"south-east":45}
for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True)
    print("rendered", name)
rig.rotation_euler = (0, 0, 0); bpy.context.view_layer.update()
v = world_to_camera_view(scene, scene.camera, mathutils.Vector((0, 0, 0)))
print("ANCHOR  unitAnchorX=%.3f%%  unitAnchorY=%.3f%%" % (v.x*100, (1-v.y)*100))
print("QUEEN_DONE ->", OUT)
