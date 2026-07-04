"""Render a CONTINUOUS stone-deck span (one flat panel instanced N times, abutting along the run
axis) at the board's TRUE-ISO angle, plus a magenta marker pass giving the exact per-cell screen
step + cell centres. Slicing this span per cell yields a middle tile that tiles BY CONSTRUCTION
(every interior cell is an identical panel placed at the cell pitch).

Run: blender --background --python render_stone_span.py -- <model.obj> <outdir> <tag>
Env: PIECE (mesh index, default 5), CELLS (default 6), RES (default 2200), ENDPIECE (index to place
     at the far terminal instead of a panel, optional), SQUASH (run-axis scale on the panel, default 1.0)
"""
import bpy, sys, math, os, json
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
# Absolute so Blender's render.filepath (which resolves relative paths against ITS own cwd, not the
# shell's) writes where we expect when the pipeline is run with repo-relative args.
MODEL, OUTDIR, TAG = os.path.abspath(argv[0]), os.path.abspath(argv[1]), argv[2]
PIECE = int(os.environ.get("PIECE", "5"))
CELLS = int(os.environ.get("CELLS", "6"))
RES = int(os.environ.get("RES", "2200"))
SQUASH = float(os.environ.get("SQUASH", "1.0"))
AXIS = os.environ.get("AXIS", "v").lower()   # 'v' = run along +Y (N-S), 'h' = run along +X (E-W)
os.makedirs(OUTDIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=MODEL)
parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

panel = parts[PIECE]
# isolate, centre on own geometry
for p in parts:
    p.hide_render = True
bpy.ops.object.select_all(action="DESELECT"); panel.select_set(True)
bpy.context.view_layer.objects.active = panel
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
panel.location = (0, 0, 0); panel.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

# align the panel's LONG (run) axis to +Y via min-area oriented bbox of its XY footprint
co = np.array([(panel.matrix_world @ v.co)[:2] for v in panel.data.vertices], float)
co -= co.mean(0)
best = None
for deg in np.arange(0.0, 90.0, 0.5):
    a = math.radians(deg)
    pr = co @ np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]]).T
    ex = pr[:, 0].max() - pr[:, 0].min(); ey = pr[:, 1].max() - pr[:, 1].min()
    if best is None or ex * ey < best[0]:
        best = (ex * ey, deg, ex, ey)
_, deg, ex, ey = best
run_ang = math.radians(deg if ex >= ey else deg + 90.0)
# Align the run to +Y (v = N-S diagonal) or +X (h = E-W diagonal). H is a SEPARATE render, not a
# mirror of V: the sun is fixed in world space, so a horizontal deck must be re-lit, not flipped.
target = math.radians(90.0) if AXIS == "v" else math.radians(0.0)
panel.rotation_euler = (0, 0, target - run_ang)
bpy.context.view_layer.update()

# optional run-axis squash to re-proportion the deck (cobblestone stretches fine)
if SQUASH != 1.0:
    panel.scale = (1.0, SQUASH, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def wext(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(c[i] for c in cs) for i in range(3)))
    mx = Vector((max(c[i] for c in cs) for i in range(3)))
    return mn, mx
mn, mx = wext(panel)
pitch = (mx.y - mn.y) if AXIS == "v" else (mx.x - mn.x)   # run extent = cell pitch (panels abut)
ztop = mx.z
print(f"PANEL {PIECE} axis={AXIS} pitch={pitch:.3f} cross={(mx.x-mn.x) if AXIS=='v' else (mx.y-mn.y):.3f} zH={mx.z-mn.z:.3f} ztop={ztop:.3f}")

# build the span: instance the panel CELLS times along the run axis, abutting; recentre at origin
span_objs = []
p0 = -(CELLS - 1) * pitch / 2.0
centres = []
for k in range(CELLS):
    o = panel if k == 0 else panel.copy()
    if k != 0:
        o.data = panel.data          # share mesh
        bpy.context.scene.collection.objects.link(o)
    coord = p0 + k * pitch
    o.location = (0, coord, 0) if AXIS == "v" else (coord, 0, 0)
    o.hide_render = False
    span_objs.append(o)
    centres.append((0.0, coord, ztop) if AXIS == "v" else (coord, 0.0, ztop))
bpy.context.view_layer.update()

# --- true-iso ortho camera framed on the span ---
yaw, elev = math.radians(45), math.radians(35.264389682754654)
r = 60.0
cam_data = bpy.data.cameras.new("iso"); cam_data.type = "ORTHO"
cam = bpy.data.objects.new("iso", cam_data); bpy.context.scene.collection.objects.link(cam)
cam.location = (r * math.cos(elev) * math.sin(yaw), -r * math.cos(elev) * math.cos(yaw), r * math.sin(elev))
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).normalized().to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam
world = bpy.data.worlds.new("w"); bpy.context.scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.6, 0.6, 0.62, 1); bg.inputs[1].default_value = 0.9
key = bpy.data.lights.new("key", type="SUN"); key.energy = 2.5
ko = bpy.data.objects.new("key", key); bpy.context.scene.collection.objects.link(ko)
ko.rotation_euler = (math.radians(55), 0, math.radians(40))
sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
    try:
        sc.render.engine = eng; break
    except Exception:
        continue
sc.render.resolution_x = RES; sc.render.resolution_y = RES
sc.render.film_transparent = True
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.view_settings.view_transform = "Standard"
# frame: span extent (run length vs the cross dimension)
span_len = CELLS * pitch
cross = (mx.x - mn.x) if AXIS == "v" else (mx.y - mn.y)
cam_data.ortho_scale = max(span_len, cross) * 1.10

def render(path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

render(os.path.join(OUTDIR, f"{TAG}-span.png"))

# --- TILE-REFERENCE marker pass ---------------------------------------------------------------
# A small magenta cube on the GROUND/TILE plane (z=0) at each cell centre. z=0 is the game-tile
# surface the bridge sits on, so anchoring these markers to the sprite's tile-equator SEATS the deck
# against a real tile (measured), and the marker centres give the per-cell screen step. (Full tile
# planes would overlap in projection and can't be separated — the visual grid below is for the eye.)
for o in span_objs:
    o.hide_render = True
mmark = bpy.data.materials.new("mk"); mmark.use_nodes = True
mmark.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (1, 0, 1, 1)
for (cx, cy, _cz) in centres:
    bpy.ops.mesh.primitive_cube_add(size=0.30, location=(cx, cy, 0.0))
    bpy.context.object.data.materials.append(mmark)
render(os.path.join(OUTDIR, f"{TAG}-markers.png"))

# --- COMBINED sanity render: the bridge sitting on a FULL game-tile grid (z=0), so we can SEE the
# deck cover the tile, centred, at a believable height — the reference the width + seating are tuned
# against. One green tile plane per cell (full pitch), the deck drawn over them.
for o in bpy.context.scene.objects:
    if o.type == "MESH" and o not in span_objs and o != panel:
        o.hide_render = True
mgrid = bpy.data.materials.new("gref"); mgrid.use_nodes = True
mgrid.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.30, 0.44, 0.28, 1)
for (cx, cy, _cz) in centres:
    bpy.ops.mesh.primitive_plane_add(size=pitch, location=(cx, cy, 0.0))
    bpy.context.object.data.materials.append(mgrid)
for o in span_objs:
    o.hide_render = False
render(os.path.join(OUTDIR, f"{TAG}-onTiles.png"))

json.dump({"piece": PIECE, "cells": CELLS, "pitch": pitch, "ztop": ztop, "axis": AXIS,
           "ortho_scale": cam_data.ortho_scale, "res": RES, "squash": SQUASH},
          open(os.path.join(OUTDIR, f"{TAG}-meta.json"), "w"), indent=1)
print("RENDERED span+markers+onTiles ->", OUTDIR)
