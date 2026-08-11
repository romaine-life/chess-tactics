"""Build a Blender file for tuning a unit's BODY and ACCENT palettes separately.

A single ColorRamp maps by brightness alone, so it cannot tell stone from gold: the
king's crown came out navy because it happened to be bright, not because anything
decided it should. Measured, the accented pieces had zero warm pixels.

The fix is Blender's own Material Index pass. Each material carries a Pass Index, an
ID Mask node turns "index == N" into a mask, and two ColorRamps run in parallel with
the mask choosing between them per pixel. Body index 1, crown 2. That took the king
from 0% warm pixels to 32.5%.

Mask anti-aliasing is off deliberately: a fractional mask blends the two palettes and
produces colours belonging to neither.

  blender --background --python build_accent_filter_lab.py
  env: SRC (piece blend), BTP (BlenderToPixels.blend), OUT (render), LAB_OUT (blend)

Accents chain: each is a Pass Index and the palette that index wears, so any number
of them stack. The king runs three -- navy body, gold crown, red velvet -- after
`split_crown_materials.py` divides the crown mesh on its own region map.
"""
# The crown's four PBR maps live in LIVE MEDIA, not in this tree.
#
# They were unpacked references into Windows Temp, which got emptied, so the crown
# rendered as flat missing-texture magenta and no compositor work could touch it. I
# then committed them here, which CI rightly refused -- media is storage-backed in this
# repo, and 3.8MB of PNG in git is exactly what check-no-committed-media guards.
#
# They are uploaded as unit-art sources at
#   docs/art/unit-concepts/blender-units/king-crown/textures/*.png
# and PACKED into the lab blend, so a lab carries its own pixels and a moved or emptied
# folder cannot break it again.
import bpy, os, math, mathutils
import numpy as np

# What the accent is called on THIS piece, so a rook does not label its gate CROWN.
ACCENT_LABEL = os.environ.get("ACCENT_LABEL", "CROWN")
# Per-piece tuning, stated here rather than passed in.
#
# These were environment variables, which meant every rebuild had to remember to pass
# them -- and twice it did not: the rook lost the outline sensitivity of 4.0 on the
# rebuild for the node layout, and the pawn came back on block 6 when it was tuned at
# 7. A tuned number that lives only in a shell command is a number you lose.
#
# PIECE selects the row. Anything not listed falls back to the defaults.
PIECE_TUNING = {
    "pawn":   {"block": 7, "outline_sensitivity": 3.0, "frame": (51, 71), "height": 2.147, "positions": [0.00000, 0.05139, 0.10824, 0.13614, 0.25274]},
    "king":   {"block": 6, "outline_sensitivity": 3.0, "frame": (51, 81), "height": 3.006, "positions": [0.00000, 0.05139, 0.10824, 0.13614, 0.25274]},
    "rook":   {"block": 5, "outline_sensitivity": 4.0, "frame": (61, 95), "height": 2.770, "positions": [0.00000, 0.05139, 0.10824, 0.13614, 0.25274]},
    "queen":  {"block": 6, "outline_sensitivity": 3.0, "frame": (51, 81), "height": 2.856, "positions": [0.00000, 0.05139, 0.10824, 0.13614, 0.25274]},
    "bishop": {"block": 7, "outline_sensitivity": 3.0, "frame": (51, 81), "height": 3.157, "positions": [0.00000, 0.04837, 0.10824, 0.16031, 0.25274]},
    "knight": {"block": 3, "outline_sensitivity": 3.0, "frame": (51, 81), "height": 2.963, "positions": [0.00000, 0.05139, 0.09428, 0.16715, 0.22410]},
}
PIECE = os.environ.get("PIECE", "")
_tuning = PIECE_TUNING.get(PIECE, {"block": 7, "outline_sensitivity": 3.0, "frame": (51, 71), "height": 2.147, "positions": [0.00000, 0.05139, 0.10824, 0.13614, 0.25274]})
if PIECE and PIECE not in PIECE_TUNING:
    raise SystemExit("no tuning row for piece %r; add one rather than rendering defaults" % PIECE)

# Frame size is per piece. Every frame was 51x71 while the pieces were scaled to their
# live proportions, so the tall ones ran off the top -- the bishop's mitre and the
# rook's battlements were both cut flat in shipped sprites, and nothing failed.
SPRITE, SPRITE_H = _tuning.get("frame", (51, 71))
SPRITE = int(os.environ.get("SPRITE_PX", SPRITE))
SPRITE_H = int(os.environ.get("SPRITE_PY", SPRITE_H))
BLOCK = int(os.environ.get("BLOCK", _tuning["block"]))
BODY = [(0.00000,"#0d1526"),(0.05139,"#172a4a"),(0.09918,"#223866"),(0.15729,"#2f4a83"),(0.28899,"#415f9c")]
# Gold for the crown. Same shape as the body ramp -- dark stop first, positions on the
# render's linear luminance, not on PNG-measured values.
GOLD = [(0.00000,"#2a1c06"),(0.05139,"#5c4310"),(0.09918,"#8a6a1e"),(0.15729,"#b8933a"),(0.28899,"#e2c268")]
VELVET = [(0.00000,"#2a0709"),(0.05139,"#5a1013"),(0.09918,"#8a1c1c"),(0.15729,"#b03028"),(0.28899,"#d4544a")]
# Each accent is a material Pass Index and the palette that index should wear. Masks
# chain in order, so a later one paints over an earlier one where they overlap.
# ONE mask for the whole crown, one ramp, keyed on brightness like the body's.
#
# Splitting gold from cloth cannot work at this size: the gilt runs about 9 px wide in
# a render that is 7x the sprite, so a strand is 1.3 SPRITE pixels. A mask can only say
# gold or not-gold, so a 1.3-pixel strand lands as 1 px here and 2 px there and breaks
# up along its length -- which is the chunky look, and no threshold moves it because
# the detail is finer than the grid.
#
# A single ramp sidesteps the decision entirely. A pixel that is part gilt and part
# cloth averages to an in-between brightness and takes an in-between stop, so
# sub-pixel detail degrades into shading rather than into blocks. Shadow reads velvet,
# highlight reads gold, and the crown holds its shape at any threshold.
# The accent ramp's colours, per piece.
#
# CROWN is the king's: dark red cushion through to bright gilt, tuned on his crown.
# Handing that to another piece paints it a crown -- the rook came back red and gold
# because its gate inherited these, which is nothing to do with a wooden gate in a
# stone wall. ACCENT_RAMP names which set to use.
CROWN = [(0.00000, "#2a0709"), (0.03628, "#5a1013"), (0.07803, "#8a1c1c"), (0.17240, "#b8933a"), (0.24367, "#e2c268")]

# Iron banding and oak planks, lit from the same direction as the stone. Positions
# start on the body's shared ladder rather than the crown's, since a gate is a surface
# in the wall and not a jewel sitting on top of it.
GATE = [(0.03323, "#1a1206"), (0.07254, "#33240f"), (0.12637, "#4d3a1c"), (0.38992, "#6b5330"), (0.87009, "#8a6f45")]

# Crystal, not gilt. The material is called "tiara gold" and its base colour is
# #e7e7e7 -- near white, metallic 0. Building the ramp off the NAME produced a gold
# tiara on a piece whose art has no gold in it; the colour is what to read. Cool
# near-white with grey-blue shadow, so it separates from navy stone by being colder and
# lighter rather than by hue.
TIARA = [(0.00000, "#2b333d"), (0.05139, "#4d5966"), (0.10824, "#7d8b98"), (0.13614, "#b3c0cb"), (0.25274, "#eef3f8")]

# The bishop's mitre shares the body's material and colour, so the art says nothing
# about what it should be. It starts as a copy of the body's navy -- separated but
# unchanged -- rather than a look invented for it. That was the tiara mistake: a ramp
# built from a name instead of from what was there.
MITRE = [(0.00000, "#0d1926"), (0.05139, "#17314a"), (0.10824, "#224466"), (0.13614, "#2f5983"), (0.25274, "#416e9c")]

ACCENT_RAMPS = {"CROWN": CROWN, "GATE": GATE, "TIARA": TIARA, "MITRE": MITRE}

ACCENTS = [(2, "CROWN gold", GOLD), (3, "CROWN velvet", VELVET)]
if os.environ.get("CROWN_SPLIT") is None:
    ACCENTS = [(2, ACCENT_LABEL, ACCENT_RAMPS.get(ACCENT_LABEL, CROWN))]
# Which HUE each accent owns, measured off the restored crown texture rather than
# assumed. Gold sits in the yellows; velvet is red and wraps past 0, so it is written
# as two bands and summed.
HUE_BANDS = {2: [(0.07, 0.20)], 3: [(0.00, 0.045), (0.94, 1.001)]}
# The materials that make up the crown, independent of how many ramps paint it.
CROWN_INDICES = [2, 3]

# Swept, not guessed: 0.18 -> 0.02 takes unclaimed crown pixels from 30 to 13 with
# ZERO body pixels tinted at any setting, so opening the gate costs nothing here. The
# 13 that remain are genuinely near-grey and have no hue to read.
HUE_MIN_SAT = float(os.environ.get("HUE_MIN_SAT", "0.02"))
# The accent layer exists to INVENT gold on a crown that had none. With the crown's
# real textures restored it may be fighting art that is already correct, so it has to
# be switchable to compare.
if os.environ.get("NO_ACCENT"):
    ACCENTS = []
_only = os.environ.get("ACCENT_ONLY")
if _only:
    ACCENTS = [a for a in ACCENTS if a[0] == int(_only)]
masks = []
hue_prev = None

def srgb(h):
    v=h.lstrip("#"); out=[]
    for i in (0,2,4):
        c=int(v[i:i+2],16)/255
        out.append(c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4)
    return out

# NOT open_mainfile on the addon's file. Opening it inherits its UI wholesale --
# including the Introduction workspace holding its manual, which is then what the lab
# opens on, every time, undoing anything fixed by hand. That cannot be repaired after
# the fact: deleting a workspace segfaults Blender 5.1, assigning window.workspace is
# ignored (verified WITH a real window, not just headless), and workspace.delete()
# under temp_override reports success and deletes nothing.
#
# So never inherit it. A factory-empty file carries Blender's own standard workspaces
# and none of the addon's, and an appended Scene brings the compositor -- the only
# thing the addon's file is wanted for -- along with it.
bpy.ops.wm.read_homefile(use_empty=True)
with bpy.data.libraries.load(os.environ["BTP"], link=False) as (_src, _dst):
    _dst.scenes = list(_src.scenes)
_appended = [s for s in bpy.data.scenes if getattr(s, "compositing_node_group", None)]
if not _appended:
    raise SystemExit("appended scene carries no compositor")
for _wm in bpy.data.window_managers:
    for _win in _wm.windows:
        _win.scene = _appended[0]
scene = _appended[0]
existing = {o.name for o in bpy.data.objects}
# The knight ships as an OBJ rather than a blend, and arrives in an arbitrary
# orientation. Same solve as the batch renderer and the piece's own canonical renderer
# -- guessing an axis convention gives a piece that renders cleanly facing the wrong
# way, which reads as a filter fault rather than an import one.
if os.environ["SRC"].lower().endswith(".obj"):
    import numpy as _np
    print("PRE_IMPORT scene=%s nodes=%s" % (scene.name, len(scene.compositing_node_group.nodes) if scene.compositing_node_group else None))
    bpy.ops.wm.obj_import(filepath=os.environ["SRC"])
    print("POST_IMPORT scene=%s nodes=%s scenes=%s" % (
        scene.name, len(scene.compositing_node_group.nodes) if scene.compositing_node_group else None,
        [x.name for x in bpy.data.scenes]))
    _ms = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in existing]
    for _o in _ms:
        _o.select_set(True)
    bpy.context.view_layer.objects.active = _ms[0]
    if len(_ms) > 1:
        bpy.ops.object.join()
    _kn = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    def _co():
        n = len(_kn.data.vertices); a = _np.empty(n * 3)
        _kn.data.vertices.foreach_get("co", a)
        return a.reshape(-1, 3)

    c = _co()
    _up = int(_np.argmax(c.max(0) - c.min(0)))
    if _up == 0:
        _kn.rotation_euler = (0, math.radians(-90), 0)
    elif _up == 1:
        _kn.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    c = _co()
    _zr = c[:, 2].max() - c[:, 2].min()
    _sp = lambda pts: _np.sqrt(((pts[:, :2] - pts[:, :2].mean(0)) ** 2).sum(1)).mean()
    if _sp(c[c[:, 2] > c[:, 2].max() - 0.2 * _zr]) > _sp(c[c[:, 2] < c[:, 2].min() + 0.2 * _zr]):
        _kn.rotation_euler = (math.radians(180), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
    c = _co()
    _zmin, _zmax = c[:, 2].min(), c[:, 2].max()
    _cen = c[:, :2].mean(0)
    _head = c[c[:, 2] > _zmin + 0.58 * (_zmax - _zmin)]
    _hr = _np.linalg.norm(_head[:, :2] - _cen, axis=1)
    _md = (_head[_hr > _np.percentile(_hr, 88)][:, :2] - _cen).mean(0)
    _kn.rotation_euler = (0, 0, (math.pi / 2) - math.atan2(_md[1], _md[0]))
    bpy.ops.object.transform_apply(rotation=True)
    c = _co()
    _k = float(os.environ.get("OBJ_HEIGHT", "2.15")) / (c[:, 2].max() - c[:, 2].min())
    _kn.scale = (_k, _k, _k)
    bpy.ops.object.transform_apply(scale=True)
    # Centre it over the origin and stand it on the floor. Without this the knight
    # imported three units off to the side, out of the camera's view entirely, and the
    # lab rendered an empty frame -- which reads as a broken compositor rather than a
    # piece parked off screen.
    c = _co()
    _kn.location = (-(c[:, 0].min() + c[:, 0].max()) / 2,
                    -(c[:, 1].min() + c[:, 1].max()) / 2,
                    -c[:, 2].min())
    bpy.ops.object.transform_apply(location=True)
    # The wood diffuse enters the ramp as brightness variation and gets quantised into
    # extra stops -- 15 colours where the plain-material pieces sit at 12. The piece's
    # own canonical renderer discards it for the same reason.
    _plain = bpy.data.materials.new("navy stone")
    _plain.use_nodes = True
    _b = _plain.node_tree.nodes.get("Principled BSDF")
    if _b is not None:
        _b.inputs["Base Color"].default_value = (*srgb("#354d69"), 1)
        if "Roughness" in _b.inputs:
            _b.inputs["Roughness"].default_value = 0.82
    _kn.data.materials.clear()
    _kn.data.materials.append(_plain)
    print("POST_OBJ scene=%s nodes=%s" % (scene.name, len(scene.compositing_node_group.nodes) if scene.compositing_node_group else None))
else:
    with bpy.data.libraries.load(os.environ["SRC"], link=False) as (src, dst):
        dst.objects = list(src.objects)
added = [o for o in bpy.data.objects if o.name not in existing]
meshes = [o for o in added if o.type=="MESH"]
for o in added:
    # obj_import links what it creates; appending from a blend does not.
    if o.type in {"MESH","EMPTY"} and o.name not in scene.collection.objects:
        scene.collection.objects.link(o)
for o in bpy.data.objects:
    if o.name in existing and o.type=="MESH": o.hide_render = o.hide_viewport = True

# Body 1, accent 2, second accent 3. This is the split the compositor masks on.
#
# Which materials count as accent is PER PIECE and set by name. The defaults cover the
# king's crown and the queen's tiara; the rook's gate is "gate iron" and "gate wood",
# which match none of them, so it would render body-only and the bridge would be
# indistinguishable from the wall. ACCENT_2 and ACCENT_3 take comma-separated
# substrings, matched case-insensitively against the material name.
ACCENT_2_MATCH = [x.strip().lower() for x in os.environ.get("ACCENT_2", "crown,tiara,gold").split(",") if x.strip()]
ACCENT_3_MATCH = [x.strip().lower() for x in os.environ.get("ACCENT_3", "velvet").split(",") if x.strip()]

# Accent by OBJECT, for pieces whose parts share a material name.
#
# The bishop's body and mitre are both "navy stone" -- same name, same colour -- so a
# name match cannot tell them apart. The mitre is its own object though, so its
# material slots can be claimed that way. Matching on ".001" would work today and break
# the moment anything is re-imported.
ACCENT_OBJECTS = [x.strip().lower() for x in os.environ.get("ACCENT_OBJECTS", "").split(",") if x.strip()]
_by_object = set()
for _o in bpy.data.objects:
    if _o.type != "MESH" or not any(x in _o.name.lower() for x in ACCENT_OBJECTS):
        continue
    for _slot in _o.material_slots:
        if _slot.material:
            _by_object.add(_slot.material.name)
if ACCENT_OBJECTS and not _by_object:
    raise SystemExit("ACCENT_OBJECTS matched no mesh: %r" % ACCENT_OBJECTS)

_matched = []
for m in bpy.data.materials:
    n = m.name.lower()
    if m.name in _by_object:
        m.pass_index = 2
    elif any(x in n for x in ACCENT_3_MATCH):
        m.pass_index = 3
    elif any(x in n for x in ACCENT_2_MATCH):
        m.pass_index = 2
    else:
        m.pass_index = 1
    if m.pass_index in (2, 3):
        _matched.append((m.name, m.pass_index))
print("ACCENT_MATERIALS", _matched or "none -- body only")

lows=[min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in meshes if o.data.vertices]
if lows:
    drop=min(lows)
    for o in added:
        if o.parent is None: o.location.z -= drop
rig = next((o for o in added if o.type=="EMPTY"), None)
if rig is None:
    rig = bpy.data.objects.new("filter_rig", None); scene.collection.objects.link(rig)
    for o in meshes:
        if o.parent is None:
            o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

# Scale to the piece's live on-board size, via the rig everything hangs off.
#
# Heights are the game's own proportions, measured from the delivery raster rather than
# from sourceFootprintPx -- that field is the CONTACT circle, labelled "Contact px" in
# the asset manager, and reading it as the draw size put the king SHORTER than the pawn.
# Pawn 1.00, rook 1.29, queen 1.33, knight 1.38, king 1.40, bishop 1.47.
#
# Scaling each root object individually does not work: parts hang off empties in some
# blends, so a per-object pass covers a different set in each. One rig, one scale, and a
# check after -- a scale that half-applies reads as art that was modelled wrong.
if _tuning.get("height") and meshes:
    def _piece_height():
        bpy.context.view_layer.update()
        zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
        return max(zs) - min(zs)
    _h0 = _piece_height()
    if _h0 > 0:
        _f = float(_tuning["height"]) / _h0
        rig.scale = tuple(c * _f for c in rig.scale)
        _h1 = _piece_height()
        if abs(_h1 - _tuning["height"]) > 0.02 * _tuning["height"]:
            raise SystemExit("piece height did not take: wanted %.3f, got %.3f" % (_tuning["height"], _h1))
        print("HEIGHT %.3f -> %.3f" % (_h0, _h1))

E=math.radians(35.264389682754654); D=5.0; c=math.cos(E)*D/math.sqrt(2)
cam = scene.camera or next(o for o in bpy.data.objects if o.type=="CAMERA")
scene.camera=cam; cam.parent=None
cam.location=(c,-c,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-mathutils.Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; # Ortho scale follows the frame WIDTH, so a wider frame is more room rather than a
# bigger piece. It was a constant 2.7, which meant widening the rook's frame to fit it
# magnified it instead -- it clipped at 81 tall, clipped again at 95, and would have
# gone on clipping. 2.7 spans 51 art pixels; anything else scales from that.
cam.data.ortho_scale = 2.7 * (SPRITE / 51.0)

vl = scene.view_layers[0]; vl.use_pass_material_index = True

# Material Index cannot mask an antialiased edge: it is an integer sampled at the
# pixel centre, so the crown's outermost block reads 0 and takes the body palette.
# A shader AOV is accumulated over the SAME samples as colour, so it comes back as
# true coverage -- 0.4 for a block the crown fills four tenths of. That is the number
# the mask needs, and it is why this is a graph change rather than a threshold tweak.
for index in CROWN_INDICES:
    aov = "acc%d" % index
    if aov not in {a.name for a in vl.aovs}:
        entry = vl.aovs.add()
        entry.name = aov
        # VALUE, not the COLOR default. An AOV Output node has both a Color and a
        # Value input and honours only the one matching the AOV's type, so a Value
        # written to a COLOR aov is silently dropped and the pass renders black --
        # which reads as "the accent has no coverage anywhere" rather than as a
        # misconfiguration, and takes the crown's colour off entirely.
        entry.type = "VALUE"
    for mat in bpy.data.materials:
        if mat.pass_index != index or not mat.use_nodes:
            continue
        if any(n.bl_idname == "ShaderNodeOutputAOV" and n.name == aov for n in mat.node_tree.nodes):
            continue
        node = mat.node_tree.nodes.new("ShaderNodeOutputAOV")
        node.name = node.aov_name = aov
        node.inputs["Value"].default_value = 1.0
scene.render.engine="CYCLES"; scene.cycles.samples=256
scene.render.filter_size=0.01; scene.view_settings.view_transform="Standard"
scene.render.film_transparent=True; scene.render.use_compositing=True
# Height is separate from width, and the ortho scale is pinned to WIDTH -- Blender fits
# it to the longer side by default, so a taller frame would shrink the piece instead of
# giving it room. A square lab frame cut the rook's battlements off at row 0, which
# would have meant tuning a piece whose top was not on screen.
scene.render.resolution_x = SPRITE * BLOCK
scene.render.resolution_y = SPRITE_H * BLOCK
cam.data.sensor_fit = "HORIZONTAL"
scene.render.image_settings.file_format="PNG"; scene.render.image_settings.color_mode="RGBA"

tree = scene.compositing_node_group
pix = next(n for n in tree.nodes if n.bl_idname=="CompositorNodePixelate")
pix.label = "pixelate (driven by BLOCK SIZE)"

# The addon gates each effect behind a SWITCH node, and they default to Off.
#
# This is why the outline never drew: the Outline group's output feeds the switch's On
# input and was being discarded downstream, so muting the group changed nothing and the
# group's own settings -- sensitivity, thickness -- were tuning something disconnected.
# The owner had been ticking this box by hand after every reload.
#
# Like every other Blender 5 control, it is an input SOCKET named "Switch", not the
# node property the API docs for older versions describe.
# The addon's Outline draws INSIDE the piece at depth steps; the stroke added here
# wraps the silhouette from outside and covers the accent boundaries too. Running both
# double-lines the piece, so the addon's is off by default -- tick it in the lab to
# compare. ADDON_OUTLINE=1 builds with it on.
_switch_state = {"Outline": bool(os.environ.get("ADDON_OUTLINE")), "Flares": False, "Fog": False}
for _n in tree.nodes:
    if _n.bl_idname != "CompositorNodeSwitch":
        continue
    _want = _switch_state.get(_n.label)
    if _want is None or "Switch" not in _n.inputs:
        continue
    _n.inputs["Switch"].default_value = _want
    print("SWITCH %-8s -> %s" % (_n.label, _want))


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

# ONE source for block size.
#
# Every stage that works in art pixels had its own Pixelate with the size baked in at
# build time, so turning the main one down left the masks quantised at the old value --
# the image went smooth while the accent edge stayed blocky. They all read this Value
# node now, so the control means what it says.
block_size = tree.nodes.new("ShaderNodeValue")
block_size.label = "BLOCK SIZE (one art pixel)"
block_size.outputs[0].default_value = float(BLOCK)

def _use_block(node, socket="Size", scale=1):
    if scale == 1:
        tree.links.new(block_size.outputs[0], node.inputs[socket])
        return
    mul = tree.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = float(scale)
    tree.links.new(block_size.outputs[0], mul.inputs[0])
    tree.links.new(mul.outputs[0], node.inputs[socket])

_use_block(pix)
ol = next((n for n in tree.nodes if n.bl_idname=="CompositorNodeGroup" and n.node_tree and n.node_tree.name.startswith("Outline")), None)
if ol:
    ol.inputs["Fine Adjust"].default_value=1.0
    ol.inputs["Sensitivity"].default_value=float(os.environ.get("OL_SENS", _tuning["outline_sensitivity"]))
    if os.environ.get("MUTE_OUTLINE"): ol.mute = True
    ol.inputs["Color"].default_value=(*srgb("#181818"),1)
    # Thickness lives INSIDE the group, on a Dilate/Erode node's Size socket -- not on
    # the group's own inputs, which is why reading the exposed sockets missed it and a
    # freshly built lab silently inherited the addon's -1 instead of the tuned 8.
    bt = next((x for x in ol.node_tree.nodes
               if (x.label or x.name).lower().startswith("border")), None)
    if bt is not None and "Size" in bt.inputs:
        bt.inputs["Size"].default_value = int(os.environ.get("OL_SIZE", "7"))
    if os.environ.get("NO_OUTLINE"):
        ol.mute = True

# Bypass the 8Mat Dither Combiner. It was harmless while every material sat at Pass
# Index 0 -- that routes to no slot -- but assigning indices 1 and 2 for the ID Mask
# switches it on, and its demo gradients run dark->navy->green->lime on slot 1 and red
# on slot 2. It then recolours the image before either of our ramps sees it, which is
# a lime body and a red crown. Route around it rather than fight its ramps.
comb = next((n for n in tree.nodes if n.bl_idname=="CompositorNodeGroup"
             and n.node_tree and n.node_tree.name.startswith("8Mat")), None)
if comb is not None and comb.inputs["Image"].is_linked and comb.outputs[0].is_linked:
    upstream = comb.inputs["Image"].links[0].from_socket
    for link in list(comb.outputs[0].links):
        target = link.to_socket
        tree.links.remove(link)
        tree.links.new(upstream, target)

rl = next(n for n in tree.nodes if n.bl_idname=="CompositorNodeRLayers")
out_node = next(n for n in tree.nodes if n.bl_idname=="NodeGroupOutput")
sink = out_node.inputs[0]
feeder = sink.links[0].from_socket

def make_ramp(stops):
    r = tree.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation="CONSTANT"
    els=r.color_ramp.elements
    while len(els)>1: els.remove(els[-1])
    els[0].position, els[0].color = stops[0][0], (*srgb(stops[0][1]),1)
    for pos,hx in stops[1:]: els.new(pos).color=(*srgb(hx),1)
    tree.links.new(feeder, r.inputs["Fac"])
    return r

# Six palettes wired at once, chosen by one number.
#
# The batch renderer picks a palette with an environment variable, which is no use at
# a node graph -- retyping five colour stops to see the piece in crimson is not
# switching palettes. So every palette gets its own ramp, and a single Value node
# labelled PALETTE selects between them: 0 navy-blue, 1 white, 2 golden, 3 emerald,
# 4 crimson, 5 black. Drag that one field and the piece changes team.
# Stop POSITIONS are shared by every palette, and deliberately live in one place.
#
# Positions are the shading structure -- where luminance breaks into bands, how much of
# the piece is shadow and how much is highlight. Colours are the team. If crimson's
# positions drift from navy's, the two teams read with different contrast and stop
# looking like one set, which is a bug you notice as "the red ones look flatter"
# without seeing why.
#
# Blender cannot link ramps: there is no shared-position mechanism, so moving a stop in
# one ColorRamp will never move the other five. That makes drift a matter of time
# rather than a possibility, so the positions are stated ONCE here and every ramp is
# built from them. Tune them on one palette in the lab, then have them read back and
# set here -- do not hand-edit five ramps to match a sixth.
# Positions are PER PIECE, and shared by the six palettes within a piece.
#
# They were global, so sliders moved on the bishop would have retuned the pawn, king,
# rook and queen -- which is not what moving a slider on the bishop means. Pieces differ
# in shape and in how the light falls, so there is no reason their luminance breaks
# should match. The six palettes within a piece still share, which is the drift that
# actually matters: teams have to read alike.
BODY_POSITIONS = _tuning["positions"]

BODY_COLOURS = [
    ("navy-blue", ["#0d1926", "#17314a", "#224466", "#2f5983", "#416e9c"]),
    ("white",     ["#3b3f47", "#717b8b", "#9daabf", "#ccdbf6", "#d7e6ff"]),
    ("golden",    ["#28200a", "#4f3d10", "#6c5519", "#8b6e25", "#a68637"]),
    ("emerald",   ["#0c2116", "#16412a", "#20593b", "#2c734e", "#3c8961"]),
    ("crimson",   ["#260c10", "#4a151d", "#66202a", "#832c39", "#9c3e4c"]),
    ("black",     ["#0d0e10", "#181c1f", "#22262b", "#2c3137", "#363b41"]),
]

if len(BODY_POSITIONS) != 5 or any(len(c) != 5 for _, c in BODY_COLOURS):
    raise SystemExit("every palette needs exactly one colour per shared position")

BODY_PALETTES = [(name, list(zip(BODY_POSITIONS, cols))) for name, cols in BODY_COLOURS]

select = tree.nodes.new("ShaderNodeValue")
select.label = "PALETTE  0=navy 1=white 2=golden 3=emerald 4=crimson 5=black"
select.outputs[0].default_value = float(os.environ.get("BODY_PALETTE_INDEX", "0"))
select.location = (-160, 460)

body = None
current = None
for pi, (pname, stops) in enumerate(BODY_PALETTES):
    ramp = make_ramp(stops)
    ramp.label = "BODY %s" % pname
    ramp.location = (200, 460 - pi * 220)
    if current is None:
        body, current = ramp, ramp.outputs["Color"]
        continue
    # COMPARE returns 1 when the two values are within epsilon, so each palette claims
    # exactly its own index and the chain reduces to a pick rather than a blend.
    hit = tree.nodes.new("ShaderNodeMath")
    hit.operation = "COMPARE"
    hit.inputs[1].default_value = float(pi)
    hit.inputs[2].default_value = 0.5
    hit.location = (360, 460 - pi * 220)
    tree.links.new(select.outputs[0], hit.inputs[0])
    pick = tree.nodes.new("ShaderNodeMix")
    pick.data_type = "RGBA"
    pick.location = (460, 460 - pi * 220)
    rgba = [x for x in pick.inputs if x.type == "RGBA"]
    tree.links.new(hit.outputs[0], pick.inputs["Factor"])
    tree.links.new(current, rgba[0])
    tree.links.new(ramp.outputs["Color"], rgba[1])
    current = [x for x in pick.outputs if x.type == "RGBA"][0]

# Two signals, each used for the one question it can answer.
#
#   IS this pixel crown at all?  The accent AOVs. They accumulate over the same
#   samples as colour, so they are correct at the antialiased silhouette where an
#   integer material pass is not.
#   Gold or cloth?               Hue, off the render itself.
#
# Hue alone cannot answer the first: a near-grey pixel has no hue, so it fell through
# to the body ramp and leaked navy through the crown. Coverage alone cannot answer the
# second: the material regions it comes from are near-random against the real texture.
# Together neither weakness is load-bearing.
# EVERY crown material, not just the ones that have their own ramp. With a single
# crown ramp the accent list is one entry long, and summing coverage over that list
# alone left the cloth's material out of the crown mask -- 22 crown pixels fell
# through to the body and came back as navy.
_crown_cov = None
for _idx in CROWN_INDICES:
    _sock = rl.outputs.get("acc%d" % _idx)
    if _sock is None:
        continue
    if _crown_cov is None:
        _crown_cov = _sock
    else:
        _u = tree.nodes.new("ShaderNodeMath"); _u.operation = "ADD"; _u.use_clamp = True
        _u.location = (0, -900)
        tree.links.new(_crown_cov, _u.inputs[0]); tree.links.new(_sock, _u.inputs[1])
        _crown_cov = _u.outputs[0]

crown_mask = None
if _crown_cov is not None:
    _cp = tree.nodes.new("CompositorNodePixelate")
    _use_block(_cp)
    _cp.location = (80, -900)
    tree.links.new(_crown_cov, _cp.inputs[0])
    _ap = tree.nodes.new("CompositorNodePixelate")
    _use_block(_ap)
    _ap.location = (80, -980)
    tree.links.new(rl.outputs["Alpha"], _ap.inputs[0])
    _dv = tree.nodes.new("ShaderNodeMath"); _dv.operation = "DIVIDE"; _dv.use_clamp = True
    _dv.location = (180, -930)
    tree.links.new(_cp.outputs[0], _dv.inputs[0]); tree.links.new(_ap.outputs[0], _dv.inputs[1])
    _hd = tree.nodes.new("ShaderNodeValToRGB")
    _hd.color_ramp.interpolation = "CONSTANT"
    _he = _hd.color_ramp.elements
    while len(_he) > 1: _he.remove(_he[-1])
    _he[0].position, _he[0].color = 0.0, (0, 0, 0, 1)
    _he.new(float(os.environ.get("CROWN_THRESH", "0.2"))).color = (1, 1, 1, 1)
    _hd.location = (280, -930)
    _hd.label = "%s region" % ACCENT_LABEL
    tree.links.new(_dv.outputs[0], _hd.inputs["Fac"])
    crown_mask = _hd.outputs["Color"]

# ID Mask turns "this pixel's material index == ACCENT_INDEX" into a mask, which then
# chooses between the two palettes. Anti-aliasing off: a fractional mask would blend
# gold into navy and produce colours in neither palette.
# The mask is built at FULL resolution and only then put on the image's grid.
# Pixelate averages, and an index pass must never be averaged: a block straddling
# index 1 and 2 becomes 1.5, matches no mask exactly, and falls through to the body
# palette -- a one-pixel lip of the wrong colour around every accent. So ID Mask
# first, on exact integers, then pixelate the resulting 0/1 mask and re-threshold it
# back to hard edges.
for offset, (index, label, stops) in enumerate(ACCENTS):
    ramp = make_ramp(stops)
    ramp.label = label
    ramp.location = (200, -60 - offset * 300)
    idm = tree.nodes.new("CompositorNodeIDMask")
    idm.inputs["Index"].default_value = index
    if "Anti-Alias" in idm.inputs:
        # A fractional mask blends two palettes and yields colours in neither.
        idm.inputs["Anti-Alias"].default_value = False
    idm.location = (0, -320 - offset * 300)
    tree.links.new(rl.outputs["Material Index"], idm.inputs["ID value"])
    coverage = rl.outputs.get("acc%d" % index)

    mask_pix = tree.nodes.new("CompositorNodePixelate")
    _use_block(mask_pix)
    mask_pix.location = (120, -400 - offset * 300)
    tree.links.new(coverage or idm.outputs["Alpha"], mask_pix.inputs[0])

    # Coverage alone still misjudges the piece's OUTER edge, where the block is part
    # crown and part nothing: 0.4 accent over 0.4 alpha is a wholly-crown block that a
    # raw 0.5 cutoff would reject. Dividing by the block's own alpha asks the question
    # that actually decides the colour -- of the ink here, how much is crown.
    alpha_pix = tree.nodes.new("CompositorNodePixelate")
    _use_block(alpha_pix)
    alpha_pix.location = (120, -520 - offset * 300)
    tree.links.new(rl.outputs["Alpha"], alpha_pix.inputs[0])
    share = tree.nodes.new("ShaderNodeMath")
    share.operation = "DIVIDE"
    share.use_clamp = True
    share.location = (210, -460 - offset * 300)
    tree.links.new(mask_pix.outputs[0], share.inputs[0])
    tree.links.new(alpha_pix.outputs[0], share.inputs[1])

    # Averaging a binary mask leaves fractions at the edges; a CONSTANT ramp with one
    # stop at the midpoint snaps them back so every block is fully one palette.
    hard = tree.nodes.new("ShaderNodeValToRGB")
    hard.color_ramp.interpolation = "CONSTANT"
    hels = hard.color_ramp.elements
    while len(hels) > 1:
        hels.remove(hels[-1])
    hels[0].position, hels[0].color = 0.0, (0, 0, 0, 1)
    # NOT 0.5. The alpha the render draws is antialiased at the silhouette; Material
    # Index is an integer pass sampled at pixel centres and is not. So the outermost
    # block of the crown is DRAWN but carries index 0, falls through to the body ramp,
    # and -- because gold is bright -- lands on the body's lightest stop. That is the
    # blue lip. A low cutoff claims any block containing ANY crown for the crown;
    # alpha still trims whatever reaches past the piece.
    # Majority rule: a block wears gold when more than half of it is gold. Measured
    # against the art, which is 64.7% gold: 0.50 gives 55.6%, 0.35 sits nearer, 0.20
    # gives 68.5%. Left at the principled value rather than the closest-fitting one.
    hels.new(float(os.environ.get("ACCENT_THRESH", "0.5"))).color = (1, 1, 1, 1)
    hard.location = (300, -400 - offset * 300)
    # Named so it is findable in the editor. Every node worth turning carries a label;
    # an unlabelled ColorRamp beside three others is a coin flip.
    hard.label = "%s cutoff" % label
    # Hue, not material index. The material split was authored against an untextured
    # crown and measures as near-random against the real art -- both halves read about
    # a third reddish and a third yellowish, so neither half means anything. The
    # render itself knows which parts are gold and which are cloth, so ask it.
    #
    # This also sidesteps what no mask on an integer pass could do: hue comes from the
    # same antialiased image as the colour, so a part-covered edge pixel is classified
    # from the blend it actually is rather than from whatever material happened to sit
    # under the pixel centre.
    hsv = tree.nodes.new("CompositorNodeSeparateColor")
    hsv.mode = "HSV"
    hsv.location = (60, -300 - offset * 300)
    # The RENDER, at full resolution -- not `feeder`, which is the image after
    # Pixelate. A 7x7 block averages gilt and cloth together before the hue is read,
    # and the blend lands outside the gold band, so gold measured 65% of the crown in
    # the art and came out 20% on the piece. Classify every rendered pixel, then
    # average the MASK (below) and threshold that: the question becomes "is this block
    # mostly gold", which is the one a block can actually answer.
    tree.links.new(rl.outputs["Image"], hsv.inputs[0])

    def _gate(sock, op, value, x, y):
        n = tree.nodes.new("ShaderNodeMath")
        n.operation = op
        n.inputs[1].default_value = value
        n.location = (x, y)
        tree.links.new(sock, n.inputs[0])
        return n.outputs[0]

    def _combine(a, b, op, x, y):
        n = tree.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = True
        n.location = (x, y)
        tree.links.new(a, n.inputs[0])
        tree.links.new(b, n.inputs[1])
        return n.outputs[0]

    band_total = None
    for bi, (lo, hi) in enumerate(HUE_BANDS[index]):
        above = _gate(hsv.outputs[0], "GREATER_THAN", lo, 140, -260 - offset * 300 - bi * 80)
        below = _gate(hsv.outputs[0], "LESS_THAN", hi, 140, -300 - offset * 300 - bi * 80)
        band = _combine(above, below, "MULTIPLY", 220, -280 - offset * 300 - bi * 80)
        band_total = band if band_total is None else _combine(
            band_total, band, "ADD", 280, -280 - offset * 300 - bi * 80)

    # Grey pixels have a meaningless hue, so gate on saturation or the body's own
    # slight warmth would claim half the piece.
    sat = _gate(hsv.outputs[1], "GREATER_THAN", HUE_MIN_SAT, 220, -380 - offset * 300)
    hue_mask = _combine(band_total, sat, "MULTIPLY", 320, -330 - offset * 300)

    pixel_mask = tree.nodes.new("CompositorNodePixelate")
    _use_block(pixel_mask)
    pixel_mask.location = (380, -330 - offset * 300)
    pixel_mask.label = "%s mask blocks" % label
    tree.links.new(hue_mask, pixel_mask.inputs[0])

    # The LAST accent takes the whole remainder of the crown rather than its own hue
    # band, so every crown pixel is claimed by one ramp or the other and none can fall
    # through to the body. That is what stops navy leaking through near-grey gilt.
    _is_last = (index == ACCENTS[-1][0])
    _sel = pixel_mask.outputs[0]
    if os.environ.get("CROWN_SPLIT") is None and crown_mask is not None:
        # One mask: the crown's own coverage, with no hue decision at all.
        _sel = crown_mask
    if _is_last and hue_prev is not None:
        _inv = tree.nodes.new("ShaderNodeMath")
        _inv.operation = "SUBTRACT"; _inv.use_clamp = True
        _inv.inputs[0].default_value = 1.0
        _inv.location = (420, -330 - offset * 300)
        tree.links.new(hue_prev, _inv.inputs[1])
        _sel = _inv.outputs[0]

    if crown_mask is not None:
        _and = tree.nodes.new("ShaderNodeMath")
        _and.operation = "MULTIPLY"; _and.use_clamp = True
        _and.location = (480, -330 - offset * 300)
        tree.links.new(crown_mask, _and.inputs[0])
        tree.links.new(_sel, _and.inputs[1])
        _sel = _and.outputs[0]

    tree.links.new(
        _sel if not os.environ.get("MASK_BY_MATERIAL") else share.outputs[0],
        hard.inputs["Fac"])

    # Grow the mask by one pixel. On the crown's outer silhouette a block is part
    # accent and part BACKGROUND, and background carries material index 0 -- matching
    # no accent mask, so it fell through to the body palette and left a one-pixel lip
    # of navy around the crown. Dilating covers those edge blocks; alpha still trims
    # anything that reaches past the piece.
    grow = tree.nodes.new("CompositorNodeDilateErode")
    # The socket is Size, NOT Distance. Blender 5 moved this off the node property
    # like ID Mask's Index, and renamed it on the way -- so a "Distance" lookup finds
    # nothing, writes nothing, and leaves the dilate at 0 while looking correct. That
    # silently no-op'd every attempt to widen this mask, and is the same mistake that
    # hid the outline's Border Thickness. Assert instead of falling back: a missing
    # socket here is a broken graph, not a version to tolerate.
    grow.inputs["Size"].default_value = int(os.environ.get("ACCENT_GROW", "1"))
    grow.location = (420, -400 - offset * 300)
    tree.links.new(hard.outputs["Color"], grow.inputs[0])

    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (460 + offset * 220, 80)
    rgba_in = [s for s in mix.inputs if s.type == "RGBA"]
    tree.links.new(grow.outputs[0], mix.inputs["Factor"])
    tree.links.new(current, rgba_in[0])
    tree.links.new(ramp.outputs["Color"], rgba_in[1])
    current = [s for s in mix.outputs if s.type == "RGBA"][0]
    masks.append(grow.outputs[0])
    # Hand the LAST accent the DECIDED gold mask, not the raw hue coverage. Taking the
    # complement before thresholding meant both selectors met the same cutoff from
    # opposite sides: at 0.2 velvet claimed everything under 0.8, at 0.8 the two left a
    # gap in the middle that fell through to the body as navy. Complementing a mask
    # that is already 0 or 1 makes the split exact at any threshold.
    if not _is_last:
        hue_prev = grow.outputs[0]

if os.environ.get("DUMP_RAW"):
    # The UNFILTERED render. Answers whether the crown is solid warm colour at this
    # angle, or whether the head shows through the crown's own openings -- which the
    # filter would then be faithfully reporting rather than inventing.
    scene.render.use_compositing = False
    scene.render.filepath = os.environ["OUT"]
    bpy.ops.render.render(write_still=True)
    raise SystemExit

if os.environ.get("DUMP_MASK"):
    # Show the FINAL accent mask as the image, so its silhouette can be compared
    # against the crown's own. Answers whether the lip is a short mask or geometry
    # that genuinely carries the body material.
    # CompositorNodeMixRGB is gone in Blender 5; shader Math works in the compositor.
    for l in list(sink.links): tree.links.remove(l)
    if len(masks) == 1:
        tree.links.new(masks[0], sink)
    else:
        u = tree.nodes.new("ShaderNodeMath"); u.operation = "MAXIMUM"
        tree.links.new(masks[0], u.inputs[0]); tree.links.new(masks[1], u.inputs[1])
        tree.links.new(u.outputs[0], sink)
    scene.render.filepath = os.environ["OUT"]
    bpy.ops.render.render(write_still=True)
    raise SystemExit

# An outline where the accent MEETS the body.
#
# The Outline group is fed by the depth pass, so it fires where the piece meets
# background and nowhere else. The queen's tiara sits flush on her head: that is a
# material boundary, not a depth one, so no outline was drawn there at all -- measured,
# nothing dark touches the tiara, everything adjacent is mid navy.
#
# The accent mask already knows exactly where that boundary is. Erode it by one and
# subtract, and what is left is its border, one pixel wide, which gets the same dark the
# silhouette outline uses.
if crown_mask is not None and not os.environ.get("NO_ACCENT_OUTLINE"):
    _shrunk = tree.nodes.new("CompositorNodeDilateErode")
    # GROW, not shrink. Eroding puts the border inside the accent, and these accents
    # are tiny -- a one-pixel inner border took the queen's 15-pixel tiara down to 1,
    # because at that size the border IS the feature. Growing puts the ring on body
    # pixels instead, so the accent keeps every pixel it had.
    _use_block(_shrunk, scale=int(os.environ.get("ACCENT_OUTLINE_PX", "1")))
    tree.links.new(crown_mask, _shrunk.inputs[0])
    _edge = tree.nodes.new("ShaderNodeMath")
    _edge.operation = "SUBTRACT"
    _edge.use_clamp = True
    tree.links.new(_shrunk.outputs[0], _edge.inputs[0])
    tree.links.new(crown_mask, _edge.inputs[1])
    _ink = tree.nodes.new("ShaderNodeMix")
    _ink.data_type = "RGBA"
    _ink.label = "ACCENT edge ink"
    _rgba = [x for x in _ink.inputs if x.type == "RGBA"]
    _rgba[1].default_value = (*srgb(os.environ.get("ACCENT_OUTLINE_COLOR", "#181818")), 1)
    tree.links.new(_edge.outputs[0], _ink.inputs["Factor"])
    tree.links.new(current, _rgba[0])
    current = [x for x in _ink.outputs if x.type == "RGBA"][0]

sep = tree.nodes.new("CompositorNodeSeparateColor")
seta = tree.nodes.new("CompositorNodeSetAlpha")
tree.links.new(feeder, sep.inputs[0])
# A real stroke: pixels OUTSIDE the silhouette.
#
# The addon's Outline draws within the piece, and the final alpha is the render's own,
# so anything painted past the edge is trimmed. That is why the tiara had no stroke
# over its top -- there was nowhere outside the shape for one to exist. Growing the
# alpha gives the stroke somewhere to live, and every pixel that is in the grown alpha
# but not the original becomes ink.
#
# Grown by whole art pixels, since a stroke half a pixel wide is not a stroke.
_alpha = sep.outputs.get("Alpha") or sep.outputs[-1]

# Make the alpha BINARY first.
#
# The render's alpha is antialiased, so grown-minus-original comes out fractional at
# the boundary -- and a fractional mix factor part-mixes ink with what was underneath,
# which is a fade rather than a stroke. That is the soft spot: pixels in neither
# palette sitting inside the outline.
#
# Pixel art wants a hard edge anyway; a half-covered pixel is either in the sprite or
# it is not.
if not os.environ.get("SOFT_ALPHA"):
    _cut = tree.nodes.new("ShaderNodeValToRGB")
    _cut.color_ramp.interpolation = "CONSTANT"
    _cut.label = "ALPHA cutoff"
    _els = _cut.color_ramp.elements
    while len(_els) > 1:
        _els.remove(_els[-1])
    _els[0].position, _els[0].color = 0.0, (0, 0, 0, 1)
    _els.new(float(os.environ.get("ALPHA_CUTOFF", "0.5"))).color = (1, 1, 1, 1)
    tree.links.new(_alpha, _cut.inputs["Fac"])
    _alpha = _cut.outputs["Color"]

if not os.environ.get("NO_STROKE"):
    _fat = tree.nodes.new("CompositorNodeDilateErode")
    _use_block(_fat, scale=int(os.environ.get("STROKE_PX", "1")))
    _fat.label = "STROKE width (Size follows BLOCK SIZE)"
    tree.links.new(_alpha, _fat.inputs[0])
    _ring = tree.nodes.new("ShaderNodeMath")
    _ring.operation = "SUBTRACT"
    _ring.use_clamp = True
    tree.links.new(_fat.outputs[0], _ring.inputs[0])
    tree.links.new(_alpha, _ring.inputs[1])
    _stroke = tree.nodes.new("ShaderNodeMix")
    _stroke.data_type = "RGBA"
    _stroke.label = "STROKE ink"
    _sr = [x for x in _stroke.inputs if x.type == "RGBA"]
    _sr[1].default_value = (*srgb(os.environ.get("STROKE_COLOR", "#181818")), 1)
    tree.links.new(_ring.outputs[0], _stroke.inputs["Factor"])
    tree.links.new(current, _sr[0])
    current = [x for x in _stroke.outputs if x.type == "RGBA"][0]
    _alpha = _fat.outputs[0]

tree.links.new(current, seta.inputs["Image"])
tree.links.new(_alpha, seta.inputs["Alpha"])
for l in list(sink.links): tree.links.remove(l)
tree.links.new(seta.outputs["Image"], sink)

# Label the two ramps so they are tellable apart in the node editor -- otherwise
# they are two identical-looking ColorRamps and it is a coin flip which is which.
sep.location = (200, -620)
seta.location = (940, 80)

# This file opens on the addon's Introduction workspace -- two text editors of its
# manual -- because that is what was active when BlenderToPixels.blend was saved, and
# the lab is a copy of it. There is no way to change that from here; both routes are
# tested, not assumed:
#
#   Deleting the workspace  -- bpy.data.workspaces has no .remove(), and
#                              batch_remove() on a workspace segfaults Blender 5.1.
#   Setting the active one  -- silently ignored in background mode. Assigning
#                              win.workspace reads back as Introduction on the very
#                              next line; the switch is deferred to a window update
#                              that never runs headlessly.
#
# The owner-side fix is Preferences > Save & Load > Load UI, off: opening a file then
# keeps the current layout instead of adopting the file's. Do not re-attempt the
# scripted versions.

# Render.
#
# One script builds the lab AND the shipped sprites, deliberately. They were two, and
# they drifted: every fix of today's -- the stroke, hard alpha, the outline switch, the
# per-piece table, accents -- went into the lab while the renderer that actually
# produces PNGs kept none of it. A whole roster was rendered from a recipe nobody had
# tuned. Two scripts that must agree will not stay agreeing.
#
# DIRECTIONS renders the roster; without it, one frame for the lab's preview.
def _collapse(path):
    """Block centres. One Pixelate block is one art pixel, so the sprite is the centre
    of each block -- skipping this leaves a sprite BLOCK times too large, which then
    gets resampled by whatever displays it and undoes the whole filter."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    half = int(BLOCK) // 2
    small = px[half::int(BLOCK), half::int(BLOCK)]
    out = bpy.data.images.new("sprite", width=small.shape[1], height=small.shape[0], alpha=True)
    out.pixels = small.reshape(-1)
    out.file_format = "PNG"
    out.filepath_raw = path
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    return small.shape[1], small.shape[0]


DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
_wanted = [d for d in os.environ.get("DIRECTIONS", "").split(",") if d]
for _d in _wanted:
    if _d not in DIRECTIONS:
        raise SystemExit("unknown direction %r" % _d)

if _wanted:
    for _name in _wanted:
        rig.rotation_euler = (0, 0, math.radians(DIRECTIONS[_name]))
        scene.render.filepath = os.path.join(os.environ["OUT"], _name)
        bpy.ops.render.render(write_still=True)
        _w, _h = _collapse(os.path.join(os.environ["OUT"], _name + ".png"))
        print("SPRITE %s %dx%d" % (_name, _w, _h))
    rig.rotation_euler = (0, 0, 0)
    # Check what landed. Mixed sizes shipped once already, silently.
    _sizes = set()
    for _name in _wanted:
        _im = bpy.data.images.load(os.path.join(os.environ["OUT"], _name + ".png"))
        _sizes.add(tuple(_im.size))
        bpy.data.images.remove(_im)
    _want_size = (SPRITE, SPRITE_H)
    for _name in _wanted:
        _im = bpy.data.images.load(os.path.join(os.environ["OUT"], _name + ".png"))
        _w, _h = _im.size
        _px = np.array(_im.pixels[:], dtype=np.float32).reshape(_h, _w, 4)
        bpy.data.images.remove(_im)
        _a = _px[..., 3] > 0.5
        _rows = np.where(_a.any(axis=1))[0]
        _cols = np.where(_a.any(axis=0))[0]
        if not len(_rows):
            raise SystemExit("%s rendered empty" % _name)
        # Blender's pixel buffer is bottom-up, so row 0 is the BOTTOM of the image.
        if _rows.min() == 0 or _rows.max() == _h - 1 or _cols.min() == 0 or _cols.max() == _w - 1:
            raise SystemExit("%s touches the frame edge: rows %d-%d of %d, cols %d-%d of %d"
                             % (_name, _rows.min(), _rows.max(), _h, _cols.min(), _cols.max(), _w))
    if _sizes != {_want_size}:
        raise SystemExit("sprites came out %s, wanted %s" % (sorted(_sizes), _want_size))
    print("SPRITES_DONE %s %dx%d" % (os.environ["OUT"], *_want_size))

# The lab's preview render, ONLY when not rendering sprites. It used to run either way
# and wrote over south.png at full resolution after the loop had collapsed it -- so
# seven facings shipped at sprite size and south shipped seven times too large, in every
# piece and every palette. The sizes were mixed and nothing failed.
if not _wanted:
    scene.render.filepath = os.environ["OUT"]
    bpy.ops.render.render(write_still=True)
if os.environ.get("LAB_OUT"):
    # The file opens on Layout, and factory Layout has no image editor -- so a render
    # pops a separate window, which has to be closed to see the model again. Retype
    # the Outliner (a small top-right pane, the least useful of the four here) into an
    # Image Editor on the render, so it is visible in place while working.
    #
    # area.type and space.image are plain data and DO take from a script, unlike the
    # active workspace. The render above has already run, so Render Result exists to
    # point at; arranging this before the render would leave the pane blank.
    # A .blend opens on whichever workspace was active when it was saved, and that is
    # Layout on a factory base. Which workspace is active CANNOT be changed from a
    # script -- assigning window.workspace is ignored in background and with a real
    # window alike, workspace.delete() under temp_override reports success and does
    # nothing, and batch_remove segfaults. Four routes, all dead.
    #
    # But what is INSIDE the opening workspace is plain data. So rather than fight for
    # a different workspace, make the one it opens on the right one: rename it and give
    # it the compositor and the render. The stock Compositing tab stays where it is for
    # anyone who wants it.
    _layout = bpy.data.workspaces.get("Layout")
    if _layout is not None:
        for _scr in _layout.screens:
            for _area in _scr.areas:
                if _area.type == "OUTLINER":
                    _area.type = "IMAGE_EDITOR"
                elif _area.type == "VIEW_3D":
                    _area.type = "NODE_EDITOR"
                    # Retyping an area swaps in a space of the new kind, but the
                    # freshly made one does not carry every property yet, so probe
                    # rather than assume.
                    _space = _area.spaces[0]
                    if hasattr(_space, "tree_type"):
                        _space.tree_type = "CompositorNodeTree"
                    # The shelf flag reads as present but is READ-ONLY on a space
                    # this freshly retyped -- its regions do not exist yet in
                    # background mode, so there is no shelf to hide. hasattr is not
                    # enough of a check here; it has to be attempted.
                    try:
                        _space.show_region_asset_shelf = False
                    except AttributeError:
                        pass
        _layout.name = "Filter"

    for _ws in bpy.data.workspaces:
        for _scr in _ws.screens:
            for _area in _scr.areas:
                if False:
                    pass
    # NOT Render Result. A render result is never written into a .blend, so a pane
    # pointing at it opens blank -- which is what "the king is not visible" looked
    # like. Load the build's own output as a real image and pack it, so opening the
    # file shows the last render immediately; F12 then swaps the pane to the live
    # Render Result as usual.
    # Render Result, even though it opens EMPTY.
    #
    # A render result is never written into a .blend, so this pane is blank until the
    # first F12 -- which looks like the file lost the piece, and I "fixed" that once by
    # pointing it at a packed still of the last build instead. That is worse: F12 then
    # renders into Render Result while the pane keeps showing the stale still, so you
    # can turn every knob in the graph and watch nothing happen. A blank pane that
    # fills on render beats a full one that never updates.
    #
    # The last build is still packed into the file as "last build", so it can be picked
    # from the dropdown to compare against.
    _shot = os.environ["OUT"] + ".png"
    if os.path.exists(_shot):
        _keep = bpy.data.images.load(_shot, check_existing=True)
        _keep.name = "last build"
        _keep.pack()
        # Nothing points at it now that the pane holds Render Result, and Blender drops
        # unreferenced datablocks on save -- so the dropdown would not have had it.
        _keep.use_fake_user = True
    _rr = bpy.data.images.get("Render Result")
    if _rr is not None:
        # Only the workspaces where the render is the subject. UV Editing and Texture
        # Paint have image editors too, and theirs are for the map being painted --
        # commandeering those would be a bug, not a convenience.
        for _ws in bpy.data.workspaces:
            if _ws.name not in {"Filter", "Layout", "Compositing", "Rendering"}:
                continue
            for _scr in _ws.screens:
                for _area in _scr.areas:
                    if _area.type == "IMAGE_EDITOR":
                        _area.spaces[0].image = _rr
    # Blender ships compositor presets as an asset shelf -- a strip of thumbnails
    # (Chromatic Aberration, Sepia, Vignette...) across the bottom of the node editor.
    # None of them belong to this filter, and they cost the graph a third of its
    # height. Plain data, so this one is simply assignable.
    WORKING = {"Filter", "Layout", "Compositing", "Rendering"}
    for _ws in bpy.data.workspaces:
        if _ws.name not in WORKING:
            continue
        for _scr in _ws.screens:
            for _area in _scr.areas:
                if _area.type == "NODE_EDITOR":
                    try:
                        _area.spaces[0].show_region_asset_shelf = False
                    except AttributeError:
                        pass

    # The timeline underneath it is an AREA, which needs an operator rather than a
    # property -- and screen.area_close under temp_override genuinely works, unlike
    # workspace.delete, which takes the same treatment and silently does nothing. The
    # lab has no animation, so the strip is pure loss.
    _win = bpy.data.window_managers[0].windows[0]
    for _ws in bpy.data.workspaces:
        if _ws.name not in WORKING:
            continue
        for _scr in _ws.screens:
            for _area in list(_scr.areas):
                if _area.type != "DOPESHEET_EDITOR":
                    continue
                with bpy.context.temp_override(window=_win, screen=_scr, area=_area):
                    bpy.ops.screen.area_close()

    # The factory base leaves an empty "Scene" behind beside the appended one, which
    # shows up in every scene picker and invites working in the wrong one.
    for _s in list(bpy.data.scenes):
        if _s is not scene and getattr(_s, "compositing_node_group", None) is None:
            bpy.data.scenes.remove(_s)

    # Lay the graph out before saving.
    #
    # Nodes were placed by hand as they were added, and the graph has grown well past
    # the point where that works -- they pile on top of each other, and the ramps worth
    # turning end up buried under the machinery that feeds them. A tuning surface you
    # cannot find the knobs in is not a tuning surface.
    #
    # Columns by dependency depth, so signal runs left to right; within a column, the
    # LABELLED nodes sort to the top, because those are the ones with a reason to be
    # looked at. Spacing is generous rather than tight -- this is read at a glance while
    # dragging a colour stop, not printed.
    _nodes = [n for n in tree.nodes if n.bl_idname != "NodeFrame"]
    _depth = {}

    def _d(node, seen=()):
        if node in _depth:
            return _depth[node]
        if node in seen:
            return 0
        best = 0
        for sock in node.inputs:
            for link in sock.links:
                best = max(best, _d(link.from_node, seen + (node,)) + 1)
        _depth[node] = best
        return best

    for _n in _nodes:
        _d(_n)
    _cols = {}
    for _n in _nodes:
        _cols.setdefault(_depth[_n], []).append(_n)
    COL_W, ROW_H = 420, 260
    for _c, _members in sorted(_cols.items()):
        _members.sort(key=lambda n: (n.label == "", (n.label or n.name).lower()))
        for _r, _n in enumerate(_members):
            _n.location = (_c * COL_W, -_r * ROW_H)
    print("LAYOUT %d nodes over %d columns" % (len(_nodes), len(_cols)))

    # Then pull every knob into ONE column, to the left of the flow.
    #
    # Depth ordering is right for reading signal but wrong for tuning: the ramps chain
    # through the palette selector, so they land in different columns and finding one
    # means panning across 18 of them. These are the nodes with a reason to be touched,
    # so they get a single stack you can open the file and see, and a frame saying so.
    # Selected by TYPE as well as label. Matching on the name alone swept in the
    # addon's own "Palette" group, which is a node group and not a knob -- a tuning
    # column with someone else's machinery in it is back to being a hunt.
    # Types AND labels, because neither alone is enough. Label alone swept in the
    # addon's own "Palette" group; type alone would have missed the stroke, which is a
    # Dilate/Erode and a Mix -- and did, leaving the owner hunting through the
    # machinery for the one control that actually draws an outline.
    _tunable_types = {"ShaderNodeValue", "ShaderNodeValToRGB", "CompositorNodePixelate",
                      "CompositorNodeDilateErode", "ShaderNodeMix", "CompositorNodeSwitch"}
    _tune_names = ("PALETTE", "BODY ", "BLOCK SIZE", "STROKE", "ACCENT EDGE", "ALPHA CUTOFF", "OUTLINE", ACCENT_LABEL)
    _tune = [n for n in _nodes
             if n.bl_idname in _tunable_types
             and (n.label or "").upper().startswith(_tune_names)]
    # Ordered by how often it is reached for, not alphabetically.
    #
    # The six body ramps are bulky, so sorting them first pushed the stroke controls
    # 4,500 units down the column and off screen -- the owner could not find the one
    # control that draws an outline. Outline and stroke go at the top; the palette
    # ramps, which are tuned once and then left, go at the bottom.
    _ORDER = ["OUTLINE", "STROKE WIDTH", "STROKE INK", "ACCENT EDGE", "ALPHA CUTOFF",
              "BLOCK SIZE", "PALETTE", ACCENT_LABEL, "BODY "]

    def _rank(n):
        lab = (n.label or "").upper()
        for i, key in enumerate(_ORDER):
            if lab.startswith(key):
                return (i, lab)
        return (len(_ORDER), lab)

    _tune.sort(key=_rank)
    _frame = tree.nodes.new("NodeFrame")
    _frame.label = "TUNE THESE"
    _frame.location = (-820, 200)
    for _i, _n in enumerate(_tune):
        _n.location = (-760, -_i * 300)
        _n.parent = _frame
    print("TUNE_COLUMN", [n.label for n in _tune])

    # Keep the compositor alive across the save.
    #
    # scene.compositing_node_group does not always count as a user, and on the OBJ path
    # -- the one that never calls libraries.load -- the group was dropped on write: 55
    # nodes in memory, 0 in the file, and a lab that opened with an empty graph and
    # rendered nothing. A fake user makes it a datablock worth writing.
    if scene.compositing_node_group is not None:
        scene.compositing_node_group.use_fake_user = True
    _n_before = len(scene.compositing_node_group.nodes) if scene.compositing_node_group else 0
    bpy.ops.wm.save_as_mainfile(filepath=os.environ["LAB_OUT"])
    # Read it straight back. A lab that saves without its graph is silently useless,
    # and the only way to know is to look at what landed on disk.
    bpy.ops.wm.open_mainfile(filepath=os.environ["LAB_OUT"])
    _sc = next((x for x in bpy.data.scenes if getattr(x, "compositing_node_group", None)), None)
    _n_after = len(_sc.compositing_node_group.nodes) if _sc else 0
    if _n_after != _n_before:
        raise SystemExit("lab saved without its compositor: %d nodes in memory, %d on disk"
                         % (_n_before, _n_after))
    print("SAVED_VERIFIED %d nodes" % _n_after)
    print("LAB_SAVED", os.environ["LAB_OUT"])
print("ACCENT_DONE", [(m.name, m.pass_index) for m in bpy.data.materials])
