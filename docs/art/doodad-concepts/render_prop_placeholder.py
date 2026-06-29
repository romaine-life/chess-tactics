import bpy, math, mathutils, sys, os
import numpy as np
# Placeholder multi-cell prop renderer. Builds a primitive tree/house, normalises it to a
# ground-anchored clump, splits front/back at the contact plane, and renders the prop frame
# the board's PropSprite expects: 192x300, contact GROUND-CENTER at pixel (96,255).
# Camera is the SAME iso rig as render_doodad_gltf.py, only re-framed for the 2x2 footprint
# (px/unit kept constant; TZ solved so the foot lands at y=255). This verifies real seating.
#   blender -b -P render_prop_placeholder.py -- OUT KIND HALF [SCALE]
#   KIND in {tree, house}.  HALF in {full, front, back}.
a = sys.argv[sys.argv.index("--") + 1:]
OUT, KIND, HALF = a[0], a[1], a[2]
SCALE = float(a[3]) if len(a) > 3 else (1.95 if KIND == "tree" else 1.55)

for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds, bpy.data.images, bpy.data.textures):
    for b in list(c):
        if getattr(b, 'users', 0) == 0:
            c.remove(b)
bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete()
os.makedirs(os.path.dirname(OUT), exist_ok=True)

def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m

parts = []
if KIND == "tree":
    bpy.ops.mesh.primitive_cylinder_add(radius=0.16, depth=0.9, location=(0, 0, 0.45))
    trunk = bpy.context.object; trunk.data.materials.append(mat("trunk", (0.33, 0.21, 0.10)))
    parts.append(trunk)
    for i, (r, z, d) in enumerate([(0.95, 1.05, 1.0), (0.72, 1.7, 0.85), (0.46, 2.25, 0.7)]):
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.0, depth=d, location=(0, 0, z), vertices=24)
        cone = bpy.context.object; cone.data.materials.append(mat("leaf%d" % i, (0.14, 0.43, 0.13)))
        parts.append(cone)
else:  # house — a small cottage: plaster walls, hip roof w/ slight overhang, chimney, door, windows
    wall_mat = mat("walls", (0.80, 0.71, 0.55))
    roof_mat = mat("roof", (0.46, 0.16, 0.12))
    trim_mat = mat("trim", (0.28, 0.17, 0.09))
    stone_mat = mat("stone", (0.45, 0.43, 0.40))
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.42))
    walls = bpy.context.object; walls.scale = (0.56, 0.56, 0.42)
    walls.data.materials.append(wall_mat); parts.append(walls)
    # hip roof: 4-sided pyramid with a modest overhang past the walls
    bpy.ops.mesh.primitive_cone_add(radius1=0.74, radius2=0.0, depth=0.52, location=(0, 0, 1.06), vertices=4)
    roof = bpy.context.object; roof.rotation_euler = (0, 0, math.radians(45))
    roof.data.materials.append(roof_mat); parts.append(roof)
    # chimney near a back corner, poking above the roof
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.28, 0.30, 1.05))
    chimney = bpy.context.object; chimney.scale = (0.09, 0.09, 0.34)
    chimney.data.materials.append(stone_mat); parts.append(chimney)
    # door on the front (-Y) face
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.565, 0.27))
    door = bpy.context.object; door.scale = (0.13, 0.02, 0.27)
    door.data.materials.append(trim_mat); parts.append(door)
    # two windows flanking the door
    for wx in (-0.30, 0.30):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(wx, -0.565, 0.5))
        win = bpy.context.object; win.scale = (0.11, 0.02, 0.11)
        win.data.materials.append(trim_mat); parts.append(win)

bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(parts) > 1:
    bpy.ops.object.join()
g = bpy.context.view_layer.objects.active

# Fit-normalise: largest dim = SCALE; centre XY; ground foot (min z) to z=0 (foot at world origin).
c = np.array([v.co for v in g.data.vertices])
ext = (c[:, 0].max() - c[:, 0].min(), c[:, 1].max() - c[:, 1].min(), c[:, 2].max() - c[:, 2].min())
s = SCALE / max(ext); g.scale = (s, s, s); bpy.ops.object.transform_apply(scale=True)
c = np.array([v.co for v in g.data.vertices])
g.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min())
bpy.ops.object.transform_apply(location=True)

# Front/back split at the toward-viewer plane (1,-1,0). +side = front (occludes unit), -side = back.
if HALF in ("front", "back"):
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.bisect(plane_co=(0, 0, 0), plane_no=(1, -1, 0),
                        clear_inner=(HALF == "front"), clear_outer=(HALF == "back"), use_fill=False)
    bpy.ops.object.mode_set(mode="OBJECT")

sc = bpy.context.scene; w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
w.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.03, 0.04, 0.06, 1)
w.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.35
bpy.ops.object.light_add(type="SUN"); k = bpy.context.object
k.rotation_euler = (math.radians(48), math.radians(8), math.radians(-42)); k.data.energy = 3.8; k.data.color = (1, .99, .95)
bpy.ops.object.light_add(type="AREA", location=(3.5, -3, 4)); bpy.context.object.data.energy = 110; bpy.context.object.data.size = 8; bpy.context.object.data.color = (.7, .78, 1)

# Prop frame: 192x300, contact ground-centre at pixel (96,255). Same iso angle as doodads;
# px/unit kept constant (doodad: 180px/1.31u = 137.4). ortho_scale = 300/137.4 = 2.183.
# Vertical solve (matches doodad calibration: screen_y(z)=center - (z-TZ)*116.7, foot z=0 -> y=255):
#   150 + TZ*116.7 = 255  =>  TZ = 0.900.
E = math.radians(35.264389682754654); D = 5.0; comp = math.cos(E) * D / math.sqrt(2); TZ = 0.900
bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
cam.location = (comp, -comp, math.sin(E) * D + TZ)
cam.rotation_euler = (mathutils.Vector((0, 0, TZ)) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.183
sc.render.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = 192; sc.render.resolution_y = 300; sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("PROP_DONE", KIND, HALF, OUT)
