"""Render one unit through the approved pixel filter at a chosen sprite size.

The subject is appended into Blender To Pixels' demo scene so its compositor stays
exactly as its author left it, the camera is put on the game's true-isometric
contract, and the knobs come from `pixel_filter_recipe.py` -- the values Nelson tuned
by eye and which were read back out of the saved file rather than transcribed.

The sizing rule is the part worth understanding. One Pixelate block is one art pixel,
so the frame is rendered at `sprite_size * block` and the blocks are collapsed to
single pixels afterwards. Rendering at the sprite's own resolution instead leaves the
filter operating on a handful of pixels: measured at 64px that collapsed the piece to
three colours and one palette stop, where the block method holds four stops and ~83%
palette coverage all the way down to 51.

  blender --background --python render_pixel_filtered_unit.py
  env: UNIT_ART_BLEND, BTP_BLEND, UNIT_ART_OUTPUT_DIR, UNIT_ART_SPRITE_PX
       optional UNIT_ART_TOON_PALETTE (default navy-blue), UNIT_ART_DIRECTIONS
"""
import bpy, os, math, mathutils
import numpy as np

SOURCE = os.environ["UNIT_ART_BLEND"]
BTP = os.environ["BTP_BLEND"]
OUT = os.environ["UNIT_ART_OUTPUT_DIR"]
SPRITE = int(os.environ.get("UNIT_ART_SPRITE_PX", "51"))
BLOCK = int(os.environ.get('UNIT_ART_BLOCK', '6'))
os.makedirs(OUT, exist_ok=True)

# Sampled from the shipped sprites; the ramp positions are LINEAR, which is where a
# palette placed from PNG-measured percentiles goes wrong -- sRGB 0.35 is linear 0.10,
# so such stops sit above nearly every pixel and collapse the piece onto one colour.
# Six team palettes, all one ramp shape.
#
# navy-blue is the tuned one. The rest carry ITS brightness ladder and wear each
# palette's own hue and saturation, taken from the mid tone the shipped sprites spend
# most of their pixels on. Re-sampling every palette from the shipped art instead does
# not work: that art is only three tones deep -- a shared dark outline, a mid and a
# light -- so five stops collapse onto two or three repeats.
#
# Brightness has to be carried as well as hue, or white and black come out identical:
# both are near grey, so hue tells you nothing about them and only value separates
# them. Their mid tones are v=0.353 and v=0.078 against navy's 0.188.
PALETTES = {
    "navy-blue": [(0.00000, "#0d1926"), (0.05139, "#17314a"), (0.10824, "#224466"), (0.13614, "#2f5983"), (0.25274, "#416e9c")],
    "white":     [(0.00000, "#3b3f47"), (0.05139, "#717b8b"), (0.10824, "#9daabf"), (0.13614, "#ccdbf6"), (0.25274, "#d7e6ff")],
    "golden":    [(0.00000, "#28200a"), (0.05139, "#4f3d10"), (0.10824, "#6c5519"), (0.13614, "#8b6e25"), (0.25274, "#a68637")],
    "emerald":   [(0.00000, "#0c2116"), (0.05139, "#16412a"), (0.10824, "#20593b"), (0.13614, "#2c734e"), (0.25274, "#3c8961")],
    "crimson":   [(0.00000, "#260c10"), (0.05139, "#4a151d"), (0.10824, "#66202a"), (0.13614, "#832c39"), (0.25274, "#9c3e4c")],
    "black":     [(0.00000, "#0d0e10"), (0.05139, "#181c1f"), (0.10824, "#22262b"), (0.13614, "#2c3137"), (0.25274, "#363b41")],
}
_PALETTE = os.environ.get("UNIT_ART_TOON_PALETTE", "navy-blue")
if _PALETTE not in PALETTES:
    raise SystemExit("unknown palette %r; have %s" % (_PALETTE, ", ".join(PALETTES)))
RAMP = PALETTES[_PALETTE]


def srgb(h):
    v = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(v[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


bpy.ops.wm.open_mainfile(filepath=BTP)
scene = bpy.context.scene
existing = {o.name for o in bpy.data.objects}

if SOURCE.lower().endswith(".obj"):
    # The knight ships as an OBJ, not a blend, and arrives in an arbitrary orientation.
    # This is the same solve the piece's own renderer uses (render_knight_fur.py), kept
    # in step with it deliberately -- guessing an axis convention produces a piece that
    # renders beautifully facing the wrong way, which reads as a filter problem.
    import numpy as _np
    bpy.ops.wm.obj_import(filepath=SOURCE)
    _ms = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in existing]
    for _o in _ms:
        _o.select_set(True)
    bpy.context.view_layer.objects.active = _ms[0]
    if len(_ms) > 1:
        bpy.ops.object.join()
    _kn = bpy.context.view_layer.objects.active
    # obj_import bakes an axis-conversion rotation; apply it before measuring anything.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    def _co():
        n = len(_kn.data.vertices)
        a = _np.empty(n * 3)
        _kn.data.vertices.foreach_get("co", a)
        return a.reshape(-1, 3)

    c = _co()
    _up = int(_np.argmax(c.max(0) - c.min(0)))       # tallest extent is the piece's up
    if _up == 0:
        _kn.rotation_euler = (0, math.radians(-90), 0)
    elif _up == 1:
        _kn.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    # A chess piece is wider at the base than the head, so if the top is the broader
    # end it came in upside down.
    c = _co()
    _zr = c[:, 2].max() - c[:, 2].min()
    _top = c[c[:, 2] > c[:, 2].max() - 0.2 * _zr]
    _bot = c[c[:, 2] < c[:, 2].min() + 0.2 * _zr]
    _spread = lambda pts: _np.sqrt(((pts[:, :2] - pts[:, :2].mean(0)) ** 2).sum(1)).mean()
    if _spread(_top) > _spread(_bot):
        _kn.rotation_euler = (math.radians(180), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
    # The muzzle is the part of the head furthest from the axis; yaw it to face south.
    c = _co()
    _zmin, _zmax = c[:, 2].min(), c[:, 2].max()
    _cen = c[:, :2].mean(0)
    _head = c[c[:, 2] > _zmin + 0.58 * (_zmax - _zmin)]
    _hr = _np.linalg.norm(_head[:, :2] - _cen, axis=1)
    _muz = _head[_hr > _np.percentile(_hr, 88)]
    _md = (_muz[:, :2] - _cen).mean(0)
    _kn.rotation_euler = (0, 0, (math.pi / 2) - math.atan2(_md[1], _md[0]))
    bpy.ops.object.transform_apply(rotation=True)
    c = _co()
    _s = float(os.environ.get("UNIT_ART_OBJ_HEIGHT", "2.0")) / (c[:, 2].max() - c[:, 2].min())
    _kn.scale = (_s, _s, _s)
    bpy.ops.object.transform_apply(scale=True)
    c = _co()
    _kn.location = (-(c[:, 0].min() + c[:, 0].max()) / 2, -(c[:, 1].min() + c[:, 1].max()) / 2, -c[:, 2].min())
    bpy.ops.object.transform_apply(location=True)
    # Drop the wood diffuse. The palette ramp reads LUMINANCE, so a texture's grain
    # enters as brightness variation the ramp then quantises -- the knight came out at
    # 15 colours where the plain-material pieces sit at 12. The piece's own renderer
    # discards this map for the same reason.
    _plain = bpy.data.materials.new("filter plain")
    _plain.use_nodes = True
    _bsdf = _plain.node_tree.nodes.get("Principled BSDF")
    if _bsdf is not None:
        _bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
        if "Roughness" in _bsdf.inputs:
            _bsdf.inputs["Roughness"].default_value = 0.6
    _kn.data.materials.clear()
    _kn.data.materials.append(_plain)
else:
    with bpy.data.libraries.load(SOURCE, link=False) as (src, dst):
        dst.objects = list(src.objects)
added = [o for o in bpy.data.objects if o.name not in existing]
meshes = [o for o in added if o.type == "MESH"]
for obj in added:
    # obj_import links what it creates already; appending from a blend does not.
    if obj.type in {"MESH", "EMPTY"} and obj.name not in scene.collection.objects:
        scene.collection.objects.link(obj)
for obj in bpy.data.objects:
    if obj.name in existing and obj.type == "MESH":
        obj.hide_render = True
        obj.hide_viewport = True

lows = [min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in meshes if o.data.vertices]
if lows:
    drop = min(lows)
    for obj in added:
        if obj.parent is None:
            obj.location.z -= drop

# Not every source ships a rig; the rook is modelled in place.
rig = next((o for o in added if o.type == "EMPTY" and o.name.startswith("rig")), None)
if rig is None:
    rig = bpy.data.objects.new("filter_rig", None)
    scene.collection.objects.link(rig)
    for obj in meshes:
        if obj.parent is None:
            obj.parent = rig
            obj.matrix_parent_inverse = rig.matrix_world.inverted()

# Height override, applied to the rig everything now hangs off.
#
# Blends are used at their authored scale, which is right when a model carries true set
# proportions -- pawn 2.15 world units, bishop 2.70, a ratio matching a real set. It is
# wrong when a piece was assembled rather than modelled: the king came out pawn-height
# because its crown was joined on and nothing rescaled the result.
#
# Scaling each root object individually does NOT work and is worth not retrying: parts
# hang off empties in some blends, so a per-object pass covers a different set of things
# in each one. On the bishop it measured 2.24 where the file is 2.70 and then produced
# 2.47 from a factor below one -- larger than it started. One rig, one scale, and a
# check afterwards, because a scale that silently half-applies reads as art that was
# modelled wrong.
_target_h = os.environ.get("UNIT_ART_PIECE_HEIGHT")
if _target_h and meshes:
    def _height():
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
        return max(zs) - min(zs)
    _before = _height()
    if _before > 0:
        k = float(_target_h) / _before
        rig.scale = tuple(c * k for c in rig.scale)
        _after = _height()
        print("PIECE_HEIGHT asked=%.4f before=%.4f after=%.4f" % (float(_target_h), _before, _after))
        if abs(_after - float(_target_h)) > 0.02 * float(_target_h):
            raise SystemExit("piece height override did not take: wanted %.4f, got %.4f" % (float(_target_h), _after))

ELEV = math.radians(35.264389682754654)
DIST = 5.0
comp = math.cos(ELEV) * DIST / math.sqrt(2)
cam = scene.camera or next(o for o in bpy.data.objects if o.type == "CAMERA")
scene.camera = cam
cam.parent = None
cam.location = (comp, -comp, 1.0 + math.sin(ELEV) * DIST)
cam.rotation_euler = (mathutils.Vector((0, 0, 1.0)) - mathutils.Vector(cam.location)).to_track_quat("-Z", "Y").to_euler()
cam.data.type = "ORTHO"
# 2.7 frames the pawn. Taller pieces need more room -- the bishop's mitre clipped at
# row 0 of the frame at 2.7 -- so this is per-piece rather than a constant.
cam.data.ortho_scale = float(os.environ.get("UNIT_ART_ORTHO", "2.7"))
# Pin the ortho scale to WIDTH. Blender fits it to the longer side by default, so a
# taller frame would silently shrink the piece -- and the whole point of a taller frame
# is to give a tall piece room WITHOUT changing its scale relative to the others. With
# this, ortho_scale is the roster's shared scale and height is per-piece headroom.
cam.data.sensor_fit = "HORIZONTAL"

scene.render.engine = "CYCLES"
scene.cycles.samples = 256
scene.render.filter_size = 0.01
scene.view_settings.view_transform = "Standard"
scene.render.film_transparent = True
scene.render.use_compositing = True
scene.render.resolution_x = SPRITE * BLOCK
scene.render.resolution_y = int(os.environ.get("UNIT_ART_SPRITE_PY", SPRITE)) * BLOCK
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

tree = scene.compositing_node_group
pix = next(n for n in tree.nodes if n.bl_idname == "CompositorNodePixelate")
next(s for s in pix.inputs if s.name == "Size").default_value = BLOCK

# The addon's demo compositor ships decorative effects AHEAD of everything, and they
# were never turned off: the chain ran Clean Image -> Fog -> Flares -> Outline ->
# Pixelate. Flares draws lens stars on bright pixels, which Pixelate then mashed into
# speckle -- a good part of what looked like a confused gold mask was star flare that
# had been quantised. Fog fades by depth, which flattens a piece meant to read at 51px.
#
# Clean Image is left alone: it denoises, which a 256-sample Cycles render wants.
for _n in tree.nodes:
    if _n.bl_idname != "CompositorNodeGroup" or not _n.node_tree:
        continue
    if _n.node_tree.name.split(".")[0] in {"Flares", "Fog"}:
        _n.mute = not os.environ.get("KEEP_DEMO_EFFECTS")

outline = next((n for n in tree.nodes if n.bl_idname == "CompositorNodeGroup"
                and n.node_tree and n.node_tree.name.startswith("Outline")), None)
if outline:
    outline.inputs["Fine Adjust"].default_value = 1.0
    outline.inputs["Sensitivity"].default_value = 3.0
    # This colour never reaches the output -- the ramp downstream remaps it -- but it
    # sets the LUMINANCE the outline hands the ramp, and so which stop the stroke
    # lands on. Leaving it at the addon default put the outline on a mid tone and cut
    # the dark coverage from 33% of the piece to 11%.
    outline.inputs["Color"].default_value = (*srgb("#181818"), 1)
    # Thickness is NOT an exposed socket. It lives inside the group on a Dilate/Erode
    # node labelled "Border Thickness", as its Size input -- so reading the group's
    # sockets misses it and a freshly built scene silently inherits the addon's -1.
    _bt = next((x for x in outline.node_tree.nodes
                if (x.label or x.name).lower().startswith("border")), None)
    if _bt is not None and "Size" in _bt.inputs:
        _bt.inputs["Size"].default_value = 7

# Palette: a CONSTANT ramp after Pixelate, with alpha split off and restored -- a
# ramp reads one value and would otherwise return the piece as an opaque square.
out_node = next(n for n in tree.nodes if n.bl_idname == "NodeGroupOutput")
sink = out_node.inputs[0]
feeder = sink.links[0].from_socket if sink.is_linked else None
if feeder is not None and not any(n.bl_idname == "ShaderNodeValToRGB" for n in tree.nodes):
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    sep = tree.nodes.new("CompositorNodeSeparateColor")
    seta = tree.nodes.new("CompositorNodeSetAlpha")
    ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    while len(els) > 1:
        els.remove(els[-1])
    els[0].position, els[0].color = RAMP[0][0], (*srgb(RAMP[0][1]), 1)
    for pos, hexv in RAMP[1:]:
        els.new(pos).color = (*srgb(hexv), 1)
    tree.links.new(feeder, ramp.inputs["Fac"])
    tree.links.new(feeder, sep.inputs[0])
    tree.links.new(ramp.outputs["Color"], seta.inputs["Image"])
    tree.links.new(sep.outputs.get("Alpha") or sep.outputs[-1], seta.inputs["Alpha"])
    for l in list(sink.links):
        tree.links.remove(l)
    tree.links.new(seta.outputs["Image"], sink)

DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
wanted = os.environ.get("UNIT_ART_DIRECTIONS", "south").split(",")
for name in wanted:
    rig.rotation_euler = (0, 0, math.radians(DIRECTIONS[name]))
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    # Collapse the blocks. Everything above renders at sprite x BLOCK because the
    # filter needs that room to work in -- but one Pixelate block IS one art pixel, so
    # what ships is the block centres. Skipping this leaves a sprite seven times its
    # true size, which then gets resampled by whatever displays it and quietly undoes
    # the whole point of a pixel filter.
    written = os.path.join(OUT, name + ".png")
    img = bpy.data.images.load(written)
    w, h = img.size
    src = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    half = BLOCK // 2
    small = src[half::BLOCK, half::BLOCK]
    out = bpy.data.images.new(name + "_sprite", width=small.shape[1], height=small.shape[0], alpha=True)
    out.pixels = small.reshape(-1)
    out.file_format = "PNG"
    out.filepath_raw = written
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    print("FILTERED", name, "%dx%d -> %dx%d" % (w, h, small.shape[1], small.shape[0]))
print("FILTERED_DONE", OUT, "render", SPRITE * BLOCK, "-> sprite", SPRITE)
