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
import bpy, os, math, mathutils

SPRITE = 51; BLOCK = 7
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
CROWN = [(0.00000, "#2a0709"), (0.05139, "#5a1013"), (0.09918, "#8a1c1c"),
         (0.15729, "#b8933a"), (0.28899, "#e2c268")]

ACCENTS = [(2, "CROWN gold", GOLD), (3, "CROWN velvet", VELVET)]
if os.environ.get("CROWN_SPLIT") is None:
    ACCENTS = [(2, "CROWN", CROWN)]
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
with bpy.data.libraries.load(os.environ["SRC"], link=False) as (src, dst):
    dst.objects = list(src.objects)
added = [o for o in bpy.data.objects if o.name not in existing]
meshes = [o for o in added if o.type=="MESH"]
for o in added:
    if o.type in {"MESH","EMPTY"}: scene.collection.objects.link(o)
for o in bpy.data.objects:
    if o.name in existing and o.type=="MESH": o.hide_render = o.hide_viewport = True

# Body 1, crown 2. This is the split the compositor masks on.
for m in bpy.data.materials:
    n = m.name.lower()
    if "velvet" in n:
        m.pass_index = 3
    elif "crown" in n or "tiara" in n or "gold" in n:
        m.pass_index = 2
    else:
        m.pass_index = 1

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

E=math.radians(35.264389682754654); D=5.0; c=math.cos(E)*D/math.sqrt(2)
cam = scene.camera or next(o for o in bpy.data.objects if o.type=="CAMERA")
scene.camera=cam; cam.parent=None
cam.location=(c,-c,1.0+math.sin(E)*D)
cam.rotation_euler=(mathutils.Vector((0,0,1.0))-mathutils.Vector(cam.location)).to_track_quat("-Z","Y").to_euler()
cam.data.type="ORTHO"; cam.data.ortho_scale=2.7

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
scene.render.resolution_x=scene.render.resolution_y=SPRITE*BLOCK
scene.render.image_settings.file_format="PNG"; scene.render.image_settings.color_mode="RGBA"

tree = scene.compositing_node_group
pix = next(n for n in tree.nodes if n.bl_idname=="CompositorNodePixelate")
pix.label = "BLOCK SIZE (one art pixel)"

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

next(s for s in pix.inputs if s.name=="Size").default_value = BLOCK
ol = next((n for n in tree.nodes if n.bl_idname=="CompositorNodeGroup" and n.node_tree and n.node_tree.name.startswith("Outline")), None)
if ol:
    ol.inputs["Fine Adjust"].default_value=1.0
    ol.inputs["Sensitivity"].default_value=5.0
    ol.inputs["Color"].default_value=(*srgb("#181818"),1)
    # Thickness lives INSIDE the group, on a Dilate/Erode node's Size socket -- not on
    # the group's own inputs, which is why reading the exposed sockets missed it and a
    # freshly built lab silently inherited the addon's -1 instead of the tuned 8.
    bt = next((x for x in ol.node_tree.nodes
               if (x.label or x.name).lower().startswith("border")), None)
    if bt is not None and "Size" in bt.inputs:
        bt.inputs["Size"].default_value = int(os.environ.get("OL_SIZE", "8"))
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
BODY_PALETTES = [
    ("navy-blue", [(0.00000, "#0d1926"), (0.05139, "#17314a"), (0.09918, "#224466"), (0.15729, "#2f5983"), (0.28899, "#416e9c")]),
    ("white",     [(0.00000, "#3b3f47"), (0.05139, "#717b8b"), (0.09918, "#9daabf"), (0.15729, "#ccdbf6"), (0.28899, "#d7e6ff")]),
    ("golden",    [(0.00000, "#28200a"), (0.05139, "#4f3d10"), (0.09918, "#6c5519"), (0.15729, "#8b6e25"), (0.28899, "#a68637")]),
    ("emerald",   [(0.00000, "#0c2116"), (0.05139, "#16412a"), (0.09918, "#20593b"), (0.15729, "#2c734e"), (0.28899, "#3c8961")]),
    ("crimson",   [(0.00000, "#260c10"), (0.05139, "#4a151d"), (0.09918, "#66202a"), (0.15729, "#832c39"), (0.28899, "#9c3e4c")]),
    ("black",     [(0.00000, "#0d0e10"), (0.05139, "#181c1f"), (0.09918, "#22262b"), (0.15729, "#2c3137"), (0.28899, "#363b41")]),
]

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
    next(t for t in _cp.inputs if t.name == "Size").default_value = BLOCK
    _cp.location = (80, -900)
    tree.links.new(_crown_cov, _cp.inputs[0])
    _ap = tree.nodes.new("CompositorNodePixelate")
    next(t for t in _ap.inputs if t.name == "Size").default_value = BLOCK
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
    _hd.label = "CROWN region"
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
    next(t for t in mask_pix.inputs if t.name == "Size").default_value = BLOCK
    mask_pix.location = (120, -400 - offset * 300)
    tree.links.new(coverage or idm.outputs["Alpha"], mask_pix.inputs[0])

    # Coverage alone still misjudges the piece's OUTER edge, where the block is part
    # crown and part nothing: 0.4 accent over 0.4 alpha is a wholly-crown block that a
    # raw 0.5 cutoff would reject. Dividing by the block's own alpha asks the question
    # that actually decides the colour -- of the ink here, how much is crown.
    alpha_pix = tree.nodes.new("CompositorNodePixelate")
    next(t for t in alpha_pix.inputs if t.name == "Size").default_value = BLOCK
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
    next(t for t in pixel_mask.inputs if t.name == "Size").default_value = BLOCK
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

sep = tree.nodes.new("CompositorNodeSeparateColor")
seta = tree.nodes.new("CompositorNodeSetAlpha")
tree.links.new(feeder, sep.inputs[0])
tree.links.new(current, seta.inputs["Image"])
tree.links.new(sep.outputs.get("Alpha") or sep.outputs[-1], seta.inputs["Alpha"])
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
    _rr = None
    _shot = os.environ["OUT"] + ".png"
    if os.path.exists(_shot):
        _rr = bpy.data.images.load(_shot, check_existing=True)
        _rr.name = "last build"
        _rr.pack()
    if _rr is None:
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

    bpy.ops.wm.save_as_mainfile(filepath=os.environ["LAB_OUT"])
    print("LAB_SAVED", os.environ["LAB_OUT"])
print("ACCENT_DONE", [(m.name, m.pass_index) for m in bpy.data.materials])
