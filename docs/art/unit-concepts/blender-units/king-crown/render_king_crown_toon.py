"""Cel-shaded native render of the 8-direction crowned king.

Same contract as `render_king_crown.py` — the canonical pipeline supplies
UNIT_ART_BLEND, UNIT_ART_OUTPUT_DIR and the exact frame dimensions, and Blender
writes that delivery raster with no resize stage. This variant replaces the
path-traced PBR surface with a cel-shaded one:

  Diffuse BSDF -> Shader to RGB -> ColorRamp (CONSTANT) -> Emission

The CONSTANT interpolation is the whole effect: it turns the smooth N.L falloff
into flat bands with a hard terminator, which is what survives at the small end
of the zoom range where a continuous gradient degenerates into noise. Shader to
RGB is EEVEE-only, which is also why this renders in milliseconds instead of
path-tracing a 28px frame no sample count can converge.

The silhouette is an inverted hull: a Solidify shell pushed out along the
normals with the normals flipped, wearing a black material with backface culling
on. The near-side shell faces cull, the far-side faces survive only where they
extend past the model, and what is left is a rim of exactly the authored
thickness. It is drawn geometry, not a post-process, so it stays hard at every
size instead of dissolving the way a downsampled line does.

Authored rung ladder, in delivery frames. The camera runs on a global multiplicative
zoom ladder (`frontend/src/game/zoomTiers.ts`), so the sizes a unit is ever drawn at
are finite and known. Art is authored one rung per OCTAVE rather than one per tier:
within an octave the gap is at most 2:1, which is where a single filtered sample is
still honest, and the renderer's mip chain covers it. Past 2:1 it is not, which is
what the old 512px sprites looked like on a zoomed-out board.

    55x65    bands=2 simplify=1   the crown is a mass, not a jewelled interior
    110x130  bands=3
    220x260  bands=3
    440x520  bands=3

The bottom rung is a redesign rather than a smaller top rung, which is the whole
reason it is authored instead of derived.

Per-rung knobs, because a 55px king is a redesign and not a smaller 440px king:
  UNIT_ART_TOON_BANDS       shading steps (3 reads as form, 2 reads as a mass)
  UNIT_ART_TOON_OUTLINE_PX  ink width in DELIVERY pixels, converted to world units
  UNIT_ART_TOON_SIMPLIFY    1 collapses the crown's interior detail to one mass
"""
import bpy, os, math, mathutils
from bpy_extras.object_utils import world_to_camera_view

BLEND = os.environ.get("UNIT_ART_BLEND")
OUT = os.environ.get("UNIT_ART_OUTPUT_DIR")
if not BLEND or not OUT:
    raise RuntimeError("run through generate-unit-art.py; private king source and output are required")
FRAME_WIDTH = int(os.environ["UNIT_ART_FRAME_WIDTH"])
FRAME_HEIGHT = int(os.environ["UNIT_ART_FRAME_HEIGHT"])
if not (1 <= FRAME_WIDTH <= 4096 and 1 <= FRAME_HEIGHT <= 4096):
    raise RuntimeError("UNIT_ART_FRAME_WIDTH/HEIGHT must be between 1 and 4096")

BANDS = int(os.environ.get("UNIT_ART_TOON_BANDS", "3"))
OUTLINE_PX = float(os.environ.get("UNIT_ART_TOON_OUTLINE_PX", "1"))
SIMPLIFY = os.environ.get("UNIT_ART_TOON_SIMPLIFY", "0") == "1"
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=BLEND)
scene = bpy.context.scene

rig = bpy.data.objects.get("rig")
if rig is None:
    rig = bpy.data.objects.new("rig", None); scene.collection.objects.link(rig)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.parent = rig; o.matrix_parent_inverse = rig.matrix_world.inverted()

# --- band palettes -----------------------------------------------------------
# Dark -> base -> rim, walked as CONSTANT stops. Written as the sRGB hex the
# accepted sprite already ships (sampled from its own pixels) so the cel-shaded
# king keeps the roster's navy and its red-and-gold crown rather than inventing
# a new identity; the shader wants linear, so they are converted below.
def srgb(hex_string):
    value = hex_string.lstrip("#")
    out = []
    for index in (0, 2, 4):
        channel = int(value[index:index + 2], 16) / 255
        out.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# The team palettes recolour the STONE band only; the crown stays gold-and-red so a
# king reads as a king whichever side holds it. The golden body is the exception —
# gold on gold loses the crown, so its accents go to dark iron.
STONE_PALETTES = {
    "navy-blue": ("#102030", "#204060", "#406090"),
    "crimson":   ("#300f14", "#6a1f2a", "#9e4552"),
    "golden":    ("#33280c", "#7a6118", "#c2a24a"),
    "emerald":   ("#0f2a1c", "#1f5a3c", "#46916a"),
    "black":     ("#101214", "#262a30", "#4a525c"),
    "white":     ("#4a505a", "#8e97a3", "#d8dee6"),
}
IRON = ("#14161a", "#3a4048", "#6e7782")
PALETTE = os.environ.get("UNIT_ART_TOON_PALETTE", "navy-blue")
if PALETTE not in STONE_PALETTES:
    raise RuntimeError(f"unknown palette {PALETTE}; expected one of {sorted(STONE_PALETTES)}")
STONE = [srgb(value) for value in STONE_PALETTES[PALETTE]]
GOLD = [srgb(value) for value in (IRON if PALETTE == "golden" else ("#3a2408", "#8a6a1e", "#d8b45a"))]
VELVET = [srgb("#3a0a0c"), srgb("#701010"), srgb("#a83028")]


# Where the terminators fall. Evenly spacing stops across 0..1 puts almost the
# whole piece in one band, because a lit sphere's N.L distribution is nowhere
# near uniform — these sit where the king's actual values cluster.
BAND_STOPS = {2: (0.42,), 3: (0.30, 0.62)}


def constant_ramp(tree, ramp_colors, bands):
    """A CONSTANT-interpolation ramp — the hard terminator, not a gradient."""
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    colors = ramp_colors[-bands:] if bands < len(ramp_colors) else ramp_colors
    stops = BAND_STOPS.get(len(colors), tuple(
        index / len(colors) for index in range(1, len(colors))))
    elements = ramp.color_ramp.elements
    while len(elements) > 1:
        elements.remove(elements[-1])
    ramp.color_ramp.interpolation = "CONSTANT"
    elements[0].position = 0.0
    elements[0].color = (*colors[0], 1)
    for index in range(1, len(colors)):
        stop = elements.new(stops[index - 1])
        stop.color = (*colors[index], 1)
    return ramp


def rgba_sockets(node):
    return [s for s in node.inputs if s.type == "RGBA"]


def toon_material(material, ramp_colors, bands):
    """Rebuild `material` as banded diffuse. Fewer bands = fewer, larger shapes."""
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = tree.nodes.new("ShaderNodeShaderToRGB")
    emission = tree.nodes.new("ShaderNodeEmission")
    ramp = constant_ramp(tree, ramp_colors, bands)
    tree.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    tree.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return material


def toon_crown(material, bands):
    """Two banded palettes selected by the crown's own painted region mask.

    The crown's textures are not in the source archive, but the mesh carries a
    `Col` corner attribute of flat region IDs. Rendering it flat identifies them:
    pure red is the velvet panels and the finial stem, green is the gold arches,
    cyan the pearls, magenta the circlet band. So velvet is red-and-only-red, and
    thresholding each channel rather than multiplying the raw values keeps the
    near-red finial gold and gives the region boundary a hard edge — which is
    what cel shading wants anyway.
    """
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    diffuse = tree.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = tree.nodes.new("ShaderNodeShaderToRGB")
    emission = tree.nodes.new("ShaderNodeEmission")

    vcol = tree.nodes.new("ShaderNodeVertexColor")
    vcol.layer_name = "Col"
    split = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(vcol.outputs["Color"], split.inputs["Color"])

    def step(socket, threshold, above=True):
        node = tree.nodes.new("ShaderNodeMath")
        node.operation = "GREATER_THAN" if above else "LESS_THAN"
        node.inputs[1].default_value = threshold
        tree.links.new(socket, node.inputs[0])
        return node.outputs["Value"]

    def both(a, b):
        node = tree.nodes.new("ShaderNodeMath")
        node.operation = "MULTIPLY"
        tree.links.new(a, node.inputs[0])
        tree.links.new(b, node.inputs[1])
        return node.outputs["Value"]

    is_red = step(split.outputs["Red"], 0.5)
    no_green = step(split.outputs["Green"], 0.07, above=False)
    no_blue = step(split.outputs["Blue"], 0.5, above=False)
    mask_g = tree.nodes.new("ShaderNodeMath")
    mask_g.operation = "MULTIPLY"
    tree.links.new(both(is_red, no_green), mask_g.inputs[0])
    tree.links.new(no_blue, mask_g.inputs[1])

    gold = constant_ramp(tree, GOLD, bands)
    velvet = constant_ramp(tree, VELVET, bands)
    tree.links.new(to_rgb.outputs["Color"], gold.inputs["Fac"])
    tree.links.new(to_rgb.outputs["Color"], velvet.inputs["Fac"])

    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    slots = rgba_sockets(mix)
    tree.links.new(mask_g.outputs["Value"], mix.inputs["Factor"])
    tree.links.new(gold.outputs["Color"], slots[0])
    tree.links.new(velvet.outputs["Color"], slots[1])

    tree.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    tree.links.new(mix.outputs[2] if len(mix.outputs) > 2 else mix.outputs[0], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return material


stone = bpy.data.materials.get("navy stone")
crown = bpy.data.materials.get("crown_pbr")
if stone is None or crown is None:
    raise RuntimeError("assembled king source is missing its 'navy stone' / 'crown_pbr' materials")
toon_material(stone, STONE, BANDS)
# A 28px crown cannot hold a jewelled interior; two bands collapse it to a red
# mass in a gold frame, which is the part of the read that survives the size.
toon_crown(crown, 2 if SIMPLIFY else BANDS)

# --- inverted-hull ink -------------------------------------------------------
ink = bpy.data.materials.new("toon_ink")
ink.use_nodes = True
ink_tree = ink.node_tree
ink_tree.nodes.clear()
ink_out = ink_tree.nodes.new("ShaderNodeOutputMaterial")
ink_emit = ink_tree.nodes.new("ShaderNodeEmission")
# Near-black rather than black: a pure 0,0,0 line reads as a hole punched in the
# board once the piece sits on dark terrain. Note the srgb() conversion — an
# emission socket is LINEAR, so writing the hex values straight in renders this
# line as mid-grey, lighter than the body's own shadow band, and the outline
# disappears into the piece instead of bounding it.
ink_emit.inputs["Color"].default_value = (*srgb("#0a0d14"), 1)
ink_tree.links.new(ink_emit.outputs["Emission"], ink_out.inputs["Surface"])
ink.use_backface_culling = True

# The camera is orthographic, so one delivery pixel is a fixed world distance:
# the frame's vertical world extent divided by its pixel height.
camera = scene.camera
ortho = camera.data.ortho_scale
world_per_px = (ortho * max(1.0, FRAME_HEIGHT / FRAME_WIDTH)) / FRAME_HEIGHT
thickness = OUTLINE_PX * world_per_px

for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
    obj.data.materials.append(ink)
    shell = obj.modifiers.new("toon_ink_hull", "SOLIDIFY")
    shell.thickness = thickness
    shell.offset = 1.0
    shell.use_rim = False
    shell.use_flip_normals = True
    shell.material_offset = len(obj.data.materials) - 1
    shell.material_offset_rim = len(obj.data.materials) - 1

# --- lighting ----------------------------------------------------------------
# The blend is lit for a path-traced PBR look: a key plus two broad area fills.
# That spread is exactly wrong here — fills lift the shadow side until nearly the
# whole piece lands in one band and the terminator has nowhere to fall. Cel
# shading wants one dominant key and only enough fill to keep the dark side from
# going to a silhouette.
for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
    if obj.data.type == "SUN":
        obj.data.energy = 4.0
    else:
        obj.data.energy *= 0.12

# --- render ------------------------------------------------------------------
scene.render.engine = "BLENDER_EEVEE"
# EEVEE rasterises, so this is antialiasing samples, not path-tracing samples --
# there is no noise to converge and nothing for a denoiser to smear.
scene.eevee.taa_render_samples = 64
# Blender reconstructs each pixel through a 1.5px-wide filter by default. That is
# right for film and ruinous here: at a 28px frame it smears detail across 5% of
# the image, which is what made the first native renders look softer than a
# resampled 512. Narrow it so samples stay inside their own pixel — the jittered
# TAA samples still antialias, they just stop bleeding into the neighbours.
scene.render.filter_size = 0.5
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = FRAME_WIDTH
scene.render.resolution_y = FRAME_HEIGHT
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
for name, angle in DIRECTIONS.items():
    rig.rotation_euler = (0, 0, math.radians(angle))
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)
    print("rendered", name)

rig.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
v = world_to_camera_view(scene, scene.camera, mathutils.Vector((0, 0, 0)))
print("ANCHOR  unitAnchorX=%.3f%%  unitAnchorY=%.3f%%" % (v.x * 100, (1 - v.y) * 100))
print("KING_TOON_DONE ->", OUT, "palette=%s bands=%d outline=%.2fpx simplify=%d" % (PALETTE, BANDS, OUTLINE_PX, SIMPLIFY))
