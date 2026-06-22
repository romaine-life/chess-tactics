"""Isolate the head + neck from the armored-steed FBX and preview it.

Run: blender --background --python knight_isolate.py
Iterate REGION until the preview shows a clean head + crinet, no body/legs/saddle.
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
FBX = (HERE / "knight-src" / "source"
       / "Meshy_AI_Armored_Steed_0130151745_texture_fbx"
       / "Meshy_AI_Armored_Steed_0130151745_texture.fbx")

# world-space keep-region for the head + upper neck (tune from previews)
REGION = dict(xmin=-0.42, xmax=0.42, ymin=-1.06, ymax=-0.30, zmin=0.30, zmax=0.95)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


clear()
bpy.ops.import_scene.fbx(filepath=str(FBX))
horse = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = horse

# keep-region box
r = REGION
loc = ((r["xmin"] + r["xmax"]) / 2, (r["ymin"] + r["ymax"]) / 2, (r["zmin"] + r["zmax"]) / 2)
dim = (r["xmax"] - r["xmin"], r["ymax"] - r["ymin"], r["zmax"] - r["zmin"])
bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
cutter = bpy.context.object
cutter.dimensions = dim
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.context.view_layer.objects.active = horse
mod = horse.modifiers.new("keep", "BOOLEAN")
mod.operation = "INTERSECT"
mod.solver = "EXACT"
mod.object = cutter
bpy.ops.object.modifier_apply(modifier="keep")
bpy.data.objects.remove(cutter, do_unlink=True)

# report resulting bounds
mn = Vector((1e18,) * 3)
mx = Vector((-1e18,) * 3)
for c in horse.bound_box:
    w = horse.matrix_world @ Vector(c)
    mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
    mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
print("HEAD_BBOX_MIN", tuple(round(v, 3) for v in mn))
print("HEAD_BBOX_MAX", tuple(round(v, 3) for v in mx))
print("HEAD_VERTS", len(horse.data.vertices))
center = (mn + mx) / 2
size = mx - mn

# preview render
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 1.2
bpy.ops.object.light_add(type="SUN", location=(2, -3, 6))
bpy.context.object.data.energy = 4.0

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = 760
scene.render.film_transparent = True
reach = max(size)


def shot(name, dir_vec):
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    scene.camera = cam
    cam.location = center + dir_vec.normalized() * reach * 2.4
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = reach * 1.35
    scene.render.filepath = str(HERE / f"knight-isolate-{name}.png")
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


shot("front", Vector((0, -1, 0.1)))
shot("persp", Vector((1, -1, 0.5)))

# cache the isolated head (mesh only) for fast reuse by the knight build
bpy.ops.object.select_all(action="DESELECT")
horse.select_set(True)
bpy.context.view_layer.objects.active = horse
bpy.ops.export_scene.gltf(
    filepath=str(HERE / "knight-head.glb"),
    use_selection=True,
    export_format="GLB",
    export_materials="NONE",
    export_yup=False,
)
print("ISOLATE_DONE")
