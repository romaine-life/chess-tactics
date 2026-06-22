"""Import the wooden chess knight OBJ, report its raw bounds, and render four
horizontal axis views + a top view so we can read its orientation (which axis is
up, which way the muzzle points) before calibrating the production render.

Run with:
    blender --background --python inspect.py
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
OBJ = (ROOT / "docs" / "art" / "unit-concepts" / "source-assets" / "knight" /
       "wooden-chess-knight-side-b" / "12936_Wooden_Chess_Knight_Side_B_V2_l3.obj")
OUT = HERE / "inspect"
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_obj():
    bpy.ops.wm.obj_import(filepath=str(OBJ))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    return objs


def world_bbox(objs):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    return mins, maxs


clear_scene()
objs = import_obj()
mins, maxs = world_bbox(objs)
size = maxs - mins
center = (mins + maxs) / 2
print(f"INSPECT mesh_objects={len(objs)}")
print(f"INSPECT bbox_min={tuple(round(v,3) for v in mins)}")
print(f"INSPECT bbox_max={tuple(round(v,3) for v in maxs)}")
print(f"INSPECT size_xyz={tuple(round(v,3) for v in size)}")
print(f"INSPECT center_xyz={tuple(round(v,3) for v in center)}")
tallest = max(range(3), key=lambda i: size[i])
print(f"INSPECT tallest_axis={'XYZ'[tallest]} (likely vertical)")

# Neutral grey material so we read silhouette/form, not the dark wood texture.
mat = bpy.data.materials.new("inspect_grey")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.6, 0.62, 0.66, 1)
bsdf.inputs["Roughness"].default_value = 0.7
for o in objs:
    o.data.materials.clear()
    o.data.materials.append(mat)

# Simple white-ish world so grey reads on transparent film.
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.6

bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
bpy.context.object.data.energy = 3.5

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 400
scene.render.resolution_y = 400
scene.render.film_transparent = True

radius = max(size) * 1.4
target = center

# Four horizontal views (looking along +X, -X, +Y, -Y) + one top view.
views = {
    "from_+X": Vector((target.x + radius, target.y, target.z)),
    "from_-X": Vector((target.x - radius, target.y, target.z)),
    "from_+Y": Vector((target.x, target.y + radius, target.z)),
    "from_-Y": Vector((target.x, target.y - radius, target.z)),
    "from_+Z_top": Vector((target.x, target.y, target.z + radius)),
}

bpy.ops.object.camera_add()
cam = bpy.context.object
scene.camera = cam
cam.data.type = "ORTHO"
cam.data.ortho_scale = max(size) * 1.2

for name, loc in views.items():
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"INSPECT_RENDER {name}")

print("INSPECT_DONE")
