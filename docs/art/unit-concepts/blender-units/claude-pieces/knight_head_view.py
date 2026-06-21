"""Open the IMPORTED knight head — the armored horse head isolated from the web
model, keeping its original textures (the piece we actually use, before any
re-pose / base / restyle).

Launch (GUI, not --background):
    blender --python knight_head_view.py
"""

import bpy
from mathutils import Vector

from pathlib import Path

HERE = Path(__file__).resolve().parent
FBX = (HERE / "knight-src" / "source"
       / "Meshy_AI_Armored_Steed_0130151745_texture_fbx"
       / "Meshy_AI_Armored_Steed_0130151745_texture.fbx")
REGION = dict(xmin=-0.42, xmax=0.42, ymin=-1.06, ymax=-0.30, zmin=0.30, zmax=0.95)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=str(FBX))
horse = next(o for o in bpy.context.scene.objects if o.type == "MESH")

# keep only the head+neck region (textures/materials preserved)
r = REGION
loc = ((r["xmin"] + r["xmax"]) / 2, (r["ymin"] + r["ymax"]) / 2, (r["zmin"] + r["zmax"]) / 2)
bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
cutter = bpy.context.object
cutter.dimensions = (r["xmax"] - r["xmin"], r["ymax"] - r["ymin"], r["zmax"] - r["zmin"])
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.context.view_layer.objects.active = horse
mod = horse.modifiers.new("keep", "BOOLEAN")
mod.operation = "INTERSECT"
mod.solver = "EXACT"
mod.object = cutter
bpy.ops.object.modifier_apply(modifier="keep")
bpy.data.objects.remove(cutter, do_unlink=True)

mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for c in horse.bound_box:
    w = horse.matrix_world @ Vector(c)
    mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
    mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
center = (mn + mx) / 2
reach = max(mx - mn)

world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.0
bpy.ops.object.light_add(type="SUN", location=(2, -3, 6))
bpy.context.object.data.energy = 3.0

bpy.ops.object.camera_add()
cam = bpy.context.object
bpy.context.scene.camera = cam
cam.location = center + Vector((1, -1.2, 0.5)).normalized() * reach * 2.2
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()

try:
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.region_3d.view_perspective = "CAMERA"
                    space.shading.type = "MATERIAL"
except Exception as exc:
    print("viewport setup skipped:", exc)

print("KNIGHT_HEAD_READY")
