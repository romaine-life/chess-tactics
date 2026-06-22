"""Claude's independent rook attempt -- v3: bonded masonry + natural wear.

Self-contained headless Blender scene. Run with:
    blender --background --python rook_claude.py

Goal: match docs/art/unit-concepts/rook-south-concept.png -- a stout square
castle tower in deep navy stone, weathered and hand-laid.

This version:
  * carves a real running-bond ashlar grid -- vertical joints span between two
    course lines and connect into them (offset half a block per row), with
    per-joint jitter, so mortar lines terminate at stone corners instead of
    floating,
  * breaks up "too perfect" surfaces: chipped edges/corners (boolean), gentle
    surface displacement, vertical grime streaks + stronger blotching,
  * keeps the carved one-piece stone mass, AO cavity grime, worn light edges,
  * keeps the open side notches + gate-front + rear wall so facing always reads.

Cutters are joined and applied in a single boolean each (fast), not one-by-one.
"""

import math
import random
import shutil
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
OUT = HERE
OUT.mkdir(parents=True, exist_ok=True)

# Bump this every iteration so renders never overwrite each other. Each hero
# render is saved as versions/<VERSION>.(png|blend) and ALSO copied to the
# convenience "latest" files rook-claude-south.png / rook-claude.blend.
VERSION = "v7-rough-rock-one-shear"
VERSIONS_DIR = OUT / "versions"
VERSIONS_DIR.mkdir(parents=True, exist_ok=True)

DIRECTIONS = {
    "north": 180, "north-east": 135, "east": 90, "south-east": 45,
    "south": 0, "south-west": -45, "west": -90, "north-west": -135,
}


# ---------------------------------------------------------------------------
# scene helpers
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.textures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def solid(name, location, scale):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def set_material(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def join_objs(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def boolean(target, cutter, op):
    mod = target.modifiers.new("bool", "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


# ---------------------------------------------------------------------------
# masonry-grid groove carving (running bond, joints connect into courses)
# ---------------------------------------------------------------------------

def _hgroove(cutters, axis, plane, lo, hi, z, depth, gw):
    c = (lo + hi) / 2
    if axis == "x":   # front face: varies in x, fixed y plane
        cutters.append(solid("h", (c, plane, z), (hi - lo, depth * 2, gw)))
    else:             # right face: varies in y, fixed x plane
        cutters.append(solid("h", (plane, c, z), (depth * 2, hi - lo, gw)))


def _vgroove(cutters, axis, plane, t, z, h, depth, gw):
    if axis == "x":
        cutters.append(solid("v", (t, plane, z), (gw, depth * 2, h)))
    else:
        cutters.append(solid("v", (plane, t, z), (depth * 2, gw, h)))


def coursed_face(rook, axis, plane, lo, hi, z0, z1,
                 block_w=0.22, course_h=0.16, depth=0.013, gw=0.015, seed=0):
    """Carve a running-bond ashlar grid onto one face and apply it. Vertical
    joints span a full course and overlap the horizontal lines so every joint
    terminates at a real stone corner. Horizontals and verticals are applied as
    two SEPARATE non-self-intersecting passes -- joining them into one cutter
    would self-intersect at the joints and the EXACT solver would carve away the
    whole body."""
    rnd = random.Random(1000 + seed)
    n = max(1, round((z1 - z0) / course_h))
    zs = [z0 + (z1 - z0) * i / n for i in range(n + 1)]
    hl, vl = [], []
    for j, z in enumerate(zs):
        jz = z if j in (0, n) else z + rnd.uniform(-0.006, 0.006)
        _hgroove(hl, axis, plane, lo, hi, jz, depth, gw)
    for i in range(n):
        zc = (zs[i] + zs[i + 1]) / 2
        h = (zs[i + 1] - zs[i]) + gw  # overlap both course lines -> connected
        x = lo + (block_w / 2 if i % 2 else 0.0)
        while x < hi - 0.04:
            if x > lo + 0.04:
                _vgroove(vl, axis, plane, x + rnd.uniform(-0.012, 0.012),
                         zc, h, depth, gw)
            x += block_w
    if hl:
        boolean(rook, join_objs(hl, "hgrooves"), "DIFFERENCE")
    if vl:
        boolean(rook, join_objs(vl, "vgrooves"), "DIFFERENCE")


def cut(rook, loc, size, rot=(0.0, 0.0, 0.0)):
    """Boolean-difference a single rotated box out of the stone."""
    c = solid("cut", loc, size)
    c.rotation_euler = rot
    boolean(rook, c, "DIFFERENCE")


def damage_pillar(rook, px, py, top_z, half, style, seed):
    """Give one corner pillar a distinct failure mode so the four never repeat:
    a clean diagonal shear, a big bitten-out chunk, a crumbled eroded top, or a
    vertical crack splitting the outer corner."""
    rnd = random.Random(seed)
    sx = 1.0 if px >= 0 else -1.0
    sy = 1.0 if py >= 0 else -1.0
    R = math.radians

    if style == "bite":        # large jagged chunk gone from the top
        cut(rook, (px + sx * 0.05, py + sy * 0.05, top_z + 0.01),
            (0.23, 0.23, 0.26),
            (R(rnd.uniform(22, 38)), R(rnd.uniform(22, 38)), R(rnd.uniform(0, 40))))
        cut(rook, (px - sx * 0.07, py - sy * 0.03, top_z - 0.03),
            (0.10, 0.10, 0.13), (R(28), R(22), R(15)))

    elif style == "shear":     # one clean diagonal slice off the outer corner
        cut(rook, (px + sx * 0.13, py + sy * 0.13, top_z + 0.05),
            (0.32, 0.32, 0.32), (R(34 * sy), R(-34 * sx), R(20)))

    elif style == "crumble":   # eroded -- many small irregular bites over the top
        for _ in range(7):
            s = rnd.uniform(0.045, 0.095)
            cut(rook, (px + rnd.uniform(-half, half), py + rnd.uniform(-half, half),
                       top_z + rnd.uniform(-0.05, 0.03)), (s, s, s),
                (R(rnd.uniform(0, 180)), R(rnd.uniform(0, 180)), R(rnd.uniform(0, 180))))

    elif style == "split":     # vertical crack splitting the outer corner apart
        cut(rook, (px + sx * 0.015, py + sy * half, top_z - 0.10),
            (0.04, 0.12, 0.34), (R(6), 0, R(7)))
        cut(rook, (px + sx * half, py + sy * 0.015, top_z - 0.10),
            (0.12, 0.04, 0.34), (0, R(6), R(7)))
        cut(rook, (px + sx * 0.08, py + sy * 0.08, top_z + 0.03),
            (0.15, 0.15, 0.12), (R(24), R(24), R(10)))


# ---------------------------------------------------------------------------
# castle-stone shader (Cycles)
# ---------------------------------------------------------------------------

def castle_stone(name, base, light, crevice, rough=0.9, noise_scale=4.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = rough
    coord = nt.nodes.new("ShaderNodeTexCoord")

    # weathering blotches (wider contrast than before)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.7
    weather = nt.nodes.new("ShaderNodeValToRGB")
    weather.color_ramp.elements[0].position = 0.22
    weather.color_ramp.elements[0].color = (*crevice, 1)
    weather.color_ramp.elements[1].position = 0.80
    weather.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], weather.inputs["Fac"])

    # vertical grime streaks (object coords stretched in Z -> stained runs)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (3.0, 3.0, 0.35)
    snoise = nt.nodes.new("ShaderNodeTexNoise")
    snoise.inputs["Scale"].default_value = 3.5
    snoise.inputs["Detail"].default_value = 4.0
    sramp = nt.nodes.new("ShaderNodeValToRGB")
    sramp.color_ramp.elements[0].position = 0.42
    sramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    sramp.color_ramp.elements[1].position = 0.62
    sramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], snoise.inputs["Vector"])
    nt.links.new(snoise.outputs["Fac"], sramp.inputs["Fac"])
    streak = nt.nodes.new("ShaderNodeMixRGB")
    streak.inputs["Color2"].default_value = (*crevice, 1)
    streak.inputs["Fac"].default_value = 0.35
    nt.links.new(weather.outputs["Color"], streak.inputs["Color1"])
    nt.links.new(sramp.outputs["Color"], streak.inputs["Fac"])

    # cavity grime via AO node
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.06
    ao.samples = 8
    ao_inv = nt.nodes.new("ShaderNodeMath")
    ao_inv.operation = "SUBTRACT"
    ao_inv.inputs[0].default_value = 1.0
    nt.links.new(ao.outputs["AO"], ao_inv.inputs[1])
    ao_gain = nt.nodes.new("ShaderNodeMath")
    ao_gain.operation = "MULTIPLY"
    ao_gain.inputs[1].default_value = 0.5
    nt.links.new(ao_inv.outputs["Value"], ao_gain.inputs[0])
    cavity = nt.nodes.new("ShaderNodeMixRGB")
    cavity.inputs["Color2"].default_value = (*crevice, 1)
    nt.links.new(streak.outputs["Color"], cavity.inputs["Color1"])
    nt.links.new(ao_gain.outputs["Value"], cavity.inputs["Fac"])

    # worn light edges: Bevel normal vs true normal
    bevel = nt.nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = 0.05
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(bevel.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Normal"], dot.inputs[1])
    edge = nt.nodes.new("ShaderNodeValToRGB")
    edge.color_ramp.elements[0].position = 0.55
    edge.color_ramp.elements[0].color = (1, 1, 1, 1)
    edge.color_ramp.elements[1].position = 0.97
    edge.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(dot.outputs["Value"], edge.inputs["Fac"])
    edge_mix = nt.nodes.new("ShaderNodeMixRGB")
    edge_mix.inputs["Color2"].default_value = (*light, 1)
    nt.links.new(cavity.outputs["Color"], edge_mix.inputs["Color1"])
    nt.links.new(edge.outputs["Color"], edge_mix.inputs["Fac"])
    nt.links.new(edge_mix.outputs["Color"], bsdf.inputs["Base Color"])

    # surface relief: voronoi stone cells + fine noise -> bump
    voro = nt.nodes.new("ShaderNodeTexVoronoi")
    voro.inputs["Scale"].default_value = noise_scale * 2.2
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = noise_scale * 4.5
    fine.inputs["Detail"].default_value = 6.0
    relief = nt.nodes.new("ShaderNodeMath")
    relief.operation = "ADD"
    nt.links.new(coord.outputs["Object"], voro.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
    nt.links.new(voro.outputs["Distance"], relief.inputs[0])
    nt.links.new(fine.outputs["Fac"], relief.inputs[1])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.42
    bump.inputs["Distance"].default_value = 0.04
    nt.links.new(relief.outputs["Value"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def plank_wood(name, base, dark):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.78
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 8.0
    wave.inputs["Distortion"].default_value = 1.6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*base, 1)
    return m


def metal(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.45
    bsdf.inputs["Metallic"].default_value = 0.85
    m.diffuse_color = (*color, 1)
    return m


STONE = CAP = WOOD = IRON = FLOOR = None


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------

def make_rook():
    stone_parts = []

    def stone(name, loc, scale, material):
        obj = solid(name, loc, scale)
        set_material(obj, material)
        stone_parts.append(obj)
        return obj

    stone("plinth", (0, 0, 0.12), (1.32, 1.32, 0.24), CAP)
    stone("base cap", (0, 0, 0.32), (1.02, 1.02, 0.16), STONE)
    stone("shaft", (0, 0, 0.97), (0.82, 0.82, 1.14), STONE)
    shaft_top = 1.54
    plat_h = 0.20
    stone("overhang", (0, 0, shaft_top + plat_h / 2), (1.16, 1.16, plat_h), CAP)
    plat_top = shaft_top + plat_h

    corner = 0.47
    cb = 0.22
    heights = {(-1, -1): 0.50, (1, -1): 0.46, (-1, 1): 0.52, (1, 1): 0.47}
    for (sx, sy), h in heights.items():
        stone("corner block", (sx * corner, sy * corner, plat_top + h / 2), (cb, cb, h), CAP)
    span = (corner - cb / 2) * 2
    wall = 0.30
    stone("rear wall", (0, corner, plat_top + wall / 2), (span, 0.18, wall), STONE)

    rook = stone_parts[0]
    rook.name = "rook_stone"
    for obj in stone_parts[1:]:
        boolean(rook, obj, "UNION")

    # --- carve bonded masonry on the camera-facing faces (per-face passes) -
    # shaft front + right
    coursed_face(rook, "x", -0.41, -0.40, 0.40, 0.56, 1.52, block_w=0.225, course_h=0.158, seed=1)
    coursed_face(rook, "y", 0.41, -0.40, 0.40, 0.56, 1.52, block_w=0.225, course_h=0.158, seed=2)
    # base cap
    coursed_face(rook, "x", -0.51, -0.46, 0.46, 0.25, 0.39, block_w=0.30, course_h=0.16, seed=3)
    coursed_face(rook, "y", 0.51, -0.46, 0.46, 0.25, 0.39, block_w=0.30, course_h=0.16, seed=4)
    # plinth (single heavy course)
    coursed_face(rook, "x", -0.66, -0.60, 0.60, 0.04, 0.22, block_w=0.40, course_h=0.20, seed=5)
    coursed_face(rook, "y", 0.66, -0.60, 0.60, 0.04, 0.22, block_w=0.40, course_h=0.20, seed=6)
    # overhang faces (one course line so the corbel reads as stone too)
    coursed_face(rook, "x", -0.58, -0.52, 0.52, 1.56, 1.72, block_w=0.34, course_h=0.18, seed=7)
    coursed_face(rook, "y", 0.58, -0.52, 0.52, 1.56, 1.72, block_w=0.34, course_h=0.18, seed=8)

    # --- damage lives on ONE pillar only: a single clean diagonal shear. The
    # other three stay intact and rely on the rough-rock surface instead. ----
    damage_pillar(rook, -corner, -corner, plat_top + heights[(-1, -1)],
                  cb / 2, "shear", seed=41)

    # --- finishing modifiers: bevel, then gentle worn displacement ---------
    bev = rook.modifiers.new("bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 2
    bev.use_clamp_overlap = True
    bev.harden_normals = True
    sub = rook.modifiers.new("sub", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = 3
    sub.render_levels = 3
    # layered displacement: medium lumps + finer pitting so the faces read as
    # rough-hewn rock rather than smooth panels.
    big = bpy.data.textures.new("rock_big", type="CLOUDS")
    big.noise_scale = 0.45
    big.noise_depth = 3
    d1 = rook.modifiers.new("disp_big", "DISPLACE")
    d1.texture = big
    d1.texture_coords = "OBJECT"
    d1.strength = 0.026
    d1.mid_level = 0.5
    fine = bpy.data.textures.new("rock_fine", type="STUCCI")
    fine.noise_scale = 0.16
    fine.stucci_type = "WALL_OUT"
    d2 = rook.modifiers.new("disp_fine", "DISPLACE")
    d2.texture = fine
    d2.texture_coords = "OBJECT"
    d2.strength = 0.013
    d2.mid_level = 0.5
    rook.modifiers.new("wn", "WEIGHTED_NORMAL")

    pieces = [rook]

    # --- non-stone parts ---------------------------------------------------
    def part(name, loc, scale, material):
        obj = solid(name, loc, scale)
        set_material(obj, material)
        fb = obj.modifiers.new("b", "BEVEL")
        fb.width = 0.01
        fb.segments = 2
        fb.use_clamp_overlap = True
        pieces.append(obj)
        return obj

    wall_z = plat_top + wall / 2
    gy = -corner
    part("courtyard floor", (0, 0, plat_top + 0.03), (0.80, 0.80, 0.05), FLOOR)
    part("gate recess", (0, gy + 0.02, wall_z), (span, 0.10, wall + 0.02), WOOD)
    part("gate planks", (0, gy - 0.02, wall_z), (span - 0.02, 0.05, wall - 0.02), WOOD)
    for px in (-0.18, -0.09, 0.0, 0.09, 0.18):
        part("plank gap", (px, gy - 0.05, wall_z), (0.01, 0.012, wall - 0.05), WOOD)
    for bz in (wall_z - wall / 2 + 0.035, wall_z + wall / 2 - 0.035):
        part("iron band", (0, gy - 0.055, bz), (span - 0.01, 0.014, 0.042), IRON)
        for sx in (-0.18, -0.06, 0.06, 0.18):
            part("stud", (sx, gy - 0.063, bz), (0.028, 0.012, 0.028), IRON)

    group = bpy.data.objects.new("rook_claude", None)
    bpy.context.collection.objects.link(group)
    for obj in pieces:
        obj.parent = group
    return group


# ---------------------------------------------------------------------------
# materials / world / camera / render
# ---------------------------------------------------------------------------

def setup_materials():
    global STONE, CAP, WOOD, IRON, FLOOR
    STONE = castle_stone("navy stone",
                         base=(0.030, 0.072, 0.125), light=(0.20, 0.31, 0.42),
                         crevice=(0.020, 0.048, 0.080), noise_scale=4.0)
    CAP = castle_stone("lit cap stone",
                       base=(0.075, 0.160, 0.245), light=(0.30, 0.43, 0.55),
                       crevice=(0.030, 0.075, 0.125), noise_scale=5.0)
    FLOOR = castle_stone("courtyard stone",
                         base=(0.045, 0.095, 0.150), light=(0.16, 0.26, 0.35),
                         crevice=(0.015, 0.040, 0.070), noise_scale=8.0)
    WOOD = plank_wood("gate wood", base=(0.30, 0.15, 0.06), dark=(0.13, 0.06, 0.022))
    IRON = metal("gate iron", (0.05, 0.06, 0.075))


def setup_world():
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.02, 0.03, 0.05, 1)
        bg.inputs["Strength"].default_value = 0.35


def setup_lighting():
    bpy.ops.object.light_add(type="SUN", location=(-3, -4, 8))
    key = bpy.context.object
    key.rotation_euler = (math.radians(50), 0, math.radians(-38))
    key.data.energy = 3.0
    key.data.angle = math.radians(3)
    key.data.color = (0.85, 0.92, 1.0)

    bpy.ops.object.light_add(type="AREA", location=(3.5, -3.0, 3.0))
    fill = bpy.context.object
    fill.data.energy = 130
    fill.data.size = 6
    fill.data.color = (0.7, 0.78, 1.0)

    bpy.ops.object.light_add(type="AREA", location=(-2.0, 4.0, 4.5))
    rim = bpy.context.object
    rim.data.energy = 80
    rim.data.size = 4
    rim.data.color = (0.55, 0.7, 1.0)


def setup_camera():
    bpy.ops.object.camera_add(location=(3.6, -3.6, 3.1))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    direction = Vector((0, 0, 0.95)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.9


def setup_render(res=768, samples=160):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    scene.cycles.device = "CPU"
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"


def build(angle=0):
    clear_scene()
    setup_world()
    setup_materials()
    setup_lighting()
    setup_camera()
    rook = make_rook()
    rook.rotation_euler[2] = math.radians(angle)
    return rook


def render_hero():
    build(0)
    setup_render(res=768, samples=180)
    vpng = VERSIONS_DIR / f"{VERSION}.png"
    vblend = VERSIONS_DIR / f"{VERSION}.blend"
    bpy.context.scene.render.filepath = str(vpng)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(vblend))
    # update the convenience "latest" copies
    shutil.copyfile(vpng, OUT / "rook-claude-south.png")
    shutil.copyfile(vblend, OUT / "rook-claude.blend")


def render_all():
    for name, angle in DIRECTIONS.items():
        build(angle)
        setup_render(res=384, samples=96)
        bpy.context.scene.render.filepath = str(OUT / "directions" / f"{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    import sys
    render_hero()
    if "--all" in sys.argv:
        render_all()
    print("ROOK_CLAUDE_DONE")
