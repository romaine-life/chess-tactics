"""Render the wooden chess knight (OBJ source) into board-calibrated
eight-direction candidate sprites, recolored into the family's navy-blue style.

Mirrors the rook's board camera contract (fixed ortho camera at a 44.1-degree
elevation; the piece rotates per compass direction) so the knight drops onto the
same isometric tile scale as every other unit.

Usage:
    blender --background --python render_knight.py -- facing      # contact sheet of south at 8 yaw offsets
    blender --background --python render_knight.py -- render      # write all 8 directions to the catalog
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE
while ROOT.parent != ROOT and not (ROOT / "frontend").exists():
    ROOT = ROOT.parent
OBJ = (ROOT / "docs" / "art" / "unit-concepts" / "source-assets" / "knight" /
       "wooden-chess-knight-side-b" / "12936_Wooden_Chess_Knight_Side_B_V2_l3.obj")
FRONTEND_KNIGHT = ROOT / "frontend" / "public" / "assets" / "units" / "knight"
CONTACT = HERE / "contact"
CONTACT.mkdir(parents=True, exist_ok=True)

# Board-calibrated camera (identical contract to the production rook render).
BOARD_DISTANCE = 5.0
BOARD_ELEVATION_DEGREES = 44.1
TARGET_HEIGHT = 1.86          # Blender units the uprighted knight is scaled to.
BOARD_ORTHO = 2.6             # frames the slim knight a touch tighter than the rook.

DIRECTIONS = {
    "north": 180, "north-east": 135, "east": 90, "south-east": 45,
    "south": 0, "south-west": -45, "west": -90, "north-west": -135,
}

# Per-model front alignment. The unit convention (docs/art/unit-concepts/README.md
# "South Direction Lock", encoded in the rook's render_versions.py DIRECTIONS) is:
# at south the piece's FRONT points local -Y, which the fixed NE camera projects to
# screen-down toward the viewer. Every OBJ imports at an arbitrary yaw, so this is
# the one-time rotation that turns the muzzle to -Y. After this, the per-direction
# render uses DIRECTIONS straight (no aesthetic offset) like every other unit.
# Resolved from the `probe` top-down view (see mode_probe).
MODEL_FRONT_YAW = 0

# Rotation that stands the imported mesh upright (head -> +Z). The importer leaves
# the tall axis along Y with the base at +Y, so -90deg about X lifts the head up.
UPRIGHT_EULER = (math.radians(-90), 0, 0)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights,
                  bpy.data.cameras, bpy.data.textures, bpy.data.worlds):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def world_bbox(objs):
    """Bounds from evaluated vertices (depsgraph), not the possibly-stale
    object.bound_box cache."""
    deps = bpy.context.evaluated_depsgraph_get()
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        ev = o.evaluated_get(deps)
        mw = ev.matrix_world
        for v in ev.data.vertices:
            wc = mw @ v.co
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    return mins, maxs


def navy_wood(name):
    """Navy-blue body in the unit family's palette, keeping a faint turned-wood
    grain so the carved form still reads. Recolor == restyle to blue, per brief."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.62
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 5.5
    wave.inputs["Distortion"].default_value = 1.4
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.020, 0.052, 0.105, 1)   # deep navy
    ramp.color_ramp.elements[1].color = (0.105, 0.205, 0.330, 1)   # lit blue
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (0.07, 0.15, 0.26, 1)
    return m


def setup_world():
    world = bpy.data.worlds.new("World")
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
    key.data.energy = 3.2
    key.data.angle = math.radians(3)
    key.data.color = (0.85, 0.92, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(3.5, -3.0, 3.0))
    bpy.context.object.data.energy = 130
    bpy.context.object.data.size = 6
    bpy.context.object.data.color = (0.7, 0.78, 1.0)
    bpy.ops.object.light_add(type="AREA", location=(-2.0, 4.0, 4.5))
    bpy.context.object.data.energy = 80
    bpy.context.object.data.size = 4
    bpy.context.object.data.color = (0.55, 0.7, 1.0)


def setup_board_camera(target_z):
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    target = Vector((0, 0, target_z))
    elev = math.radians(BOARD_ELEVATION_DEGREES)
    horizontal = math.cos(elev) * BOARD_DISTANCE
    comp = horizontal / math.sqrt(2)
    cam.location = (
        target.x + comp,
        target.y - comp,
        target.z + math.sin(elev) * BOARD_DISTANCE,
    )
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = BOARD_ORTHO
    return cam


def load_knight():
    """Import, upright (Y-up -> Z-up), center on origin, sit base on Z=0, scale to
    the board. Returns (empty_parent, target_z) where target_z is mid-height."""
    bpy.ops.wm.obj_import(filepath=str(OBJ))
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    mesh.data.materials.clear()
    mesh.data.materials.append(navy_wood("knight_navy"))

    # transform_apply (an operator) silently no-ops in --background (no VIEW3D
    # context), so bake every static transform straight into the mesh data with
    # matrix math instead. Start by folding the import matrix into the vertices
    # and resetting the object transform to identity.
    mesh.data.transform(mesh.matrix_world)
    mesh.matrix_world = Matrix.Identity(4)

    def bake(matrix):
        mesh.data.transform(matrix)
        mesh.data.update()

    def data_bbox():
        mins = Vector((1e9, 1e9, 1e9))
        maxs = Vector((-1e9, -1e9, -1e9))
        for v in mesh.data.vertices:
            for i in range(3):
                mins[i] = min(mins[i], v.co[i])
                maxs[i] = max(maxs[i], v.co[i])
        return mins, maxs

    mins, maxs = data_bbox()
    print(f"DBG after_import size={tuple(round(v,3) for v in (maxs - mins))}")

    # Upright so the head points to +Z. UPRIGHT_EULER is resolved empirically.
    bake(Matrix.Rotation(UPRIGHT_EULER[0], 4, "X"))

    mins, maxs = data_bbox()
    size = maxs - mins
    print(f"DBG after_upright size={tuple(round(v,3) for v in size)}")
    bake(Matrix.Scale(TARGET_HEIGHT / size.z, 4))

    mins, maxs = data_bbox()
    center = (mins + maxs) / 2
    bake(Matrix.Translation((-center.x, -center.y, -mins.z)))  # center X/Y, base on Z=0

    mins, maxs = data_bbox()
    height = maxs.z - mins.z

    # Estimate where the muzzle points: at jaw height the snout is the dominant
    # horizontal mass off the vertical axis. Printed only as a hint for setting
    # MODEL_FRONT_YAW; the committed value is verified against the probe render.
    jaw_lo, jaw_hi = mins.z + 0.50 * height, mins.z + 0.72 * height
    sx = sy = 0.0
    for v in mesh.data.vertices:
        if jaw_lo <= v.co.z <= jaw_hi:
            sx += v.co.x
            sy += v.co.y
    muzzle_deg = math.degrees(math.atan2(sy, sx))
    print(f"DBG muzzle_dir~={muzzle_deg:.1f}deg  suggest MODEL_FRONT_YAW~={(-90 - muzzle_deg):.1f}")

    # One-time per-model front alignment: rotate the muzzle onto local -Y.
    bake(Matrix.Rotation(math.radians(MODEL_FRONT_YAW), 4, "Z"))

    mins, maxs = data_bbox()
    print(f"DBG final size={tuple(round(v,3) for v in (maxs - mins))}")
    target_z = (mins.z + maxs.z) / 2

    empty = bpy.data.objects.new("knight", None)
    bpy.context.collection.objects.link(empty)
    mesh.parent = empty
    return empty, target_z


def render_settings(res):
    s = bpy.context.scene
    try:
        s.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        s.render.engine = "BLENDER_EEVEE"
    if hasattr(s, "eevee") and hasattr(s.eevee, "taa_render_samples"):
        s.eevee.taa_render_samples = 64
    s.view_settings.view_transform = "Standard"
    s.render.resolution_x = res
    s.render.resolution_y = res
    s.render.film_transparent = True


def build_scene():
    clear_scene()
    setup_world()
    setup_lighting()
    knight, target_z = load_knight()
    setup_board_camera(target_z)
    return knight


def mode_facing():
    """Render the SOUTH camera view at eight yaw offsets — a coarse probe for
    where the muzzle points; use `probe <deg>` to fine-tune MODEL_FRONT_YAW."""
    knight = build_scene()
    render_settings(360)
    for offset in range(0, 360, 45):
        knight.rotation_euler[2] = math.radians(offset)
        bpy.context.scene.render.filepath = str(CONTACT / f"south_yaw_{offset:03d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"FACING_RENDER offset={offset}")
    print("FACING_DONE")


def mode_probe():
    """Verify the front alignment: a top-down view (screen-up=+Y, screen-right=+X;
    so -Y is screen-DOWN) and the board south view, both at object yaw 0. After
    MODEL_FRONT_YAW is right, the muzzle points screen-down in the top probe and
    toward the viewer (screen down-right) in the south probe."""
    knight = build_scene()
    render_settings(420)
    knight.rotation_euler[2] = 0

    # Top-down ortho camera, independent of the board camera added by build_scene.
    bpy.ops.object.camera_add(location=(0, 0, 12))
    top = bpy.context.object
    top.rotation_euler = (0, 0, 0)            # looks down -Z, local up = +Y
    top.data.type = "ORTHO"
    top.data.ortho_scale = 2.6
    bpy.context.scene.camera = top
    bpy.context.scene.render.filepath = str(CONTACT / "probe_top.png")
    bpy.ops.render.render(write_still=True)

    # Restore the board camera (last non-top camera) for the south probe.
    board = next(o for o in bpy.context.scene.objects if o.type == "CAMERA" and o is not top)
    bpy.context.scene.camera = board
    bpy.context.scene.render.filepath = str(CONTACT / "probe_south.png")
    bpy.ops.render.render(write_still=True)
    print("PROBE_DONE")


def mode_render():
    knight = build_scene()
    render_settings(512)
    out = FRONTEND_KNIGHT / "candidate-wooden"
    out.mkdir(parents=True, exist_ok=True)
    for direction, angle in DIRECTIONS.items():
        knight.rotation_euler[2] = math.radians(angle)   # convention: no offset
        bpy.context.scene.render.filepath = str(out / f"{direction}.png")
        bpy.ops.render.render(write_still=True)
        print(f"RENDER {direction}")
    print(f"RENDER_DONE -> {out}")


argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
mode = argv[0] if argv else "render"
if len(argv) > 1:  # optional CLI override: `-- probe 45`
    MODEL_FRONT_YAW = float(argv[1])
    print(f"DBG MODEL_FRONT_YAW override={MODEL_FRONT_YAW}")
if mode == "facing":
    mode_facing()
elif mode == "probe":
    mode_probe()
else:
    mode_render()
