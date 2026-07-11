"""Build and render native-size Blender stone-fence candidates.

This is a source-art lane, not a bitmap-bake lane.  Blender owns the modular
stone geometry and renders straight to the runtime frame (96x180).  The visible
stone color comes from the repository's sourced photoscan material.  No output
image is resized before it is written.

Run from the repository root:

    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" \
      --background --factory-startup --python \
      docs/art/fence-concepts/candidates/2026-07-10/blender-stone/render_blender_stone.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


FRAME_WIDTH = 96
FRAME_HEIGHT = 180
ANCHOR_X = 48
ANCHOR_Y = 68

# The canonical board diamond is 96x54.  One four-unit ground edge therefore
# projects to 48x27 pixels.  The camera and render target create those pixels
# directly; these constants are not post-render correction factors.
EDGE_WORLD_LENGTH = 4.0
EDGE_PIXEL_WIDTH = 48
EDGE_PIXEL_RISE = 27
CAMERA_ELEVATION = math.asin(EDGE_PIXEL_RISE / EDGE_PIXEL_WIDTH)
ORTHO_SCALE = (
    2.0
    * (EDGE_WORLD_LENGTH / math.sqrt(2.0))
    / (FRAME_WIDTH / FRAME_HEIGHT)
)

HERE = Path(__file__).resolve().parent


def find_repo_root() -> Path:
    for candidate in (HERE, *HERE.parents):
        if (candidate / "frontend").is_dir() and (candidate / "docs" / "adr").is_dir():
            return candidate
    raise RuntimeError("could not locate repository root")


ROOT = find_repo_root()
STONE_TEXTURE = (
    ROOT
    / "docs"
    / "art"
    / "wall-concepts"
    / "materials"
    / "source"
    / "stone-photoscan.png"
)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def link_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def beveled_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    bevel: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_to_collection(obj, collection)
    obj.data.materials.append(material)

    modifier = obj.modifiers.new(name="Worn stone edges", type="BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    modifier.affect = "EDGES"
    return obj


def make_stone_material() -> bpy.types.Material:
    if not STONE_TEXTURE.exists():
        raise FileNotFoundError(f"missing stone material: {STONE_TEXTURE}")

    image = bpy.data.images.load(str(STONE_TEXTURE), check_existing=True)
    image.name = "Stone photoscan source"

    material = bpy.data.materials.new("Sourced fieldstone photoscan")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    for node in list(nodes):
        nodes.remove(node)

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (620, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (350, 40)
    shader.inputs["Roughness"].default_value = 0.91
    shader.inputs["IOR"].default_value = 1.46

    coordinates = nodes.new("ShaderNodeTexCoord")
    coordinates.location = (-650, 40)
    texture_origin = bpy.data.objects.new("Stone texture projection origin", None)
    bpy.context.scene.collection.objects.link(texture_origin)
    coordinates.object = texture_origin

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-430, 40)
    # World-space mapping keeps the sourced material continuous across modular
    # boxes.  It changes UV density inside the 3D render, not the output raster.
    mapping.inputs["Scale"].default_value = (0.42, 0.42, 0.42)

    texture = nodes.new("ShaderNodeTexImage")
    texture.location = (-170, 80)
    texture.image = image
    texture.interpolation = "Closest"
    texture.extension = "REPEAT"
    texture.projection = "BOX"
    texture.projection_blend = 0.08

    luminance = nodes.new("ShaderNodeRGBToBW")
    luminance.location = (60, -135)
    bump = nodes.new("ShaderNodeBump")
    bump.location = (165, -100)
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.055

    links.new(coordinates.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(texture.outputs["Color"], luminance.inputs["Color"])
    links.new(luminance.outputs["Val"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def create_rail(
    name: str,
    axis: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> None:
    """Create one low, modular fieldstone rail along a tile's near edge.

    The union of length (3.56) and cap thickness (0.44) is four world units,
    giving the candidate a 48-pixel projected span at the canonical camera.
    """

    length = 3.56
    body_thickness = 0.34
    cap_thickness = 0.44
    body_height = 0.82
    cap_height = 0.18

    if axis == "Y":
        center = (0.0, EDGE_WORLD_LENGTH / 2.0, body_height / 2.0)
        dimensions = (body_thickness, length, body_height)
    elif axis == "X":
        center = (-EDGE_WORLD_LENGTH / 2.0, 0.0, body_height / 2.0)
        dimensions = (length, body_thickness, body_height)
    else:
        raise ValueError(axis)

    beveled_box(
        f"{name} fieldstone body",
        center,
        dimensions,
        collection,
        material,
        bevel=0.045,
    )

    # Five capstones make the source geometry visibly modular at native 1x.
    # The tiny joints are real model gaps; they are not lines painted in code.
    cap_length = 0.68
    gap = 0.04
    run = 5 * cap_length + 4 * gap
    start = (EDGE_WORLD_LENGTH - run) / 2.0 + cap_length / 2.0
    for index in range(5):
        along = start + index * (cap_length + gap)
        z = body_height + cap_height / 2.0
        if axis == "Y":
            cap_center = (0.0, along, z)
            cap_dimensions = (cap_thickness, cap_length, cap_height)
        else:
            cap_center = (-EDGE_WORLD_LENGTH + along, 0.0, z)
            cap_dimensions = (cap_length, cap_thickness, cap_height)
        beveled_box(
            f"{name} capstone {index + 1}",
            cap_center,
            cap_dimensions,
            collection,
            material,
            bevel=0.035,
        )


def create_terminal_post(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> None:
    # The 0.76-unit cap projects to roughly 18 pixels wide; the 1.0-unit total
    # height plus its ground-plane depth yields roughly a 24-pixel visible bbox.
    beveled_box(
        "Terminal post base",
        (0.0, 0.0, 0.07),
        (0.70, 0.70, 0.14),
        collection,
        material,
        bevel=0.035,
    )
    beveled_box(
        "Terminal post shaft",
        (0.0, 0.0, 0.52),
        (0.54, 0.54, 0.90),
        collection,
        material,
        bevel=0.045,
    )
    beveled_box(
        "Terminal post capstone",
        (0.0, 0.0, 1.01),
        (0.76, 0.76, 0.18),
        collection,
        material,
        bevel=0.045,
    )

    bpy.ops.mesh.primitive_cone_add(
        vertices=4,
        radius1=0.34,
        radius2=0.17,
        depth=0.12,
        location=(0.0, 0.0, 1.16),
        rotation=(0.0, 0.0, math.radians(45.0)),
    )
    crown = bpy.context.object
    crown.name = "Terminal post weather cap"
    link_to_collection(crown, collection)
    crown.data.materials.append(material)
    bevel = crown.modifiers.new(name="Worn cap edges", type="BEVEL")
    bevel.width = 0.025
    bevel.segments = 1


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    distance = 24.0
    horizontal = math.cos(CAMERA_ELEVATION) * distance / math.sqrt(2.0)
    camera.location = (
        target.x + horizontal,
        target.y - horizontal,
        target.z + math.sin(CAMERA_ELEVATION) * distance,
    )
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def aim_camera_for_origin_y(camera: bpy.types.Object, origin_y: float) -> None:
    pixels_per_world = FRAME_HEIGHT / ORTHO_SCALE
    target_height = (origin_y - FRAME_HEIGHT / 2) / (
        pixels_per_world * math.cos(CAMERA_ELEVATION)
    )
    point_camera(camera, Vector((0.0, 0.0, target_height)))


def configure_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = FRAME_WIDTH
    scene.render.resolution_y = FRAME_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = ""
    scene.render.filter_size = 0.01
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    # The existing gameplay fence family uses binary alpha. Coverage is made
    # binary inside Blender's compositor at the native render size; this is
    # alpha hardening only, one of ADR-0076's explicitly permitted transforms.
    # It does not move, interpolate, or resize any color pixel.
    compositor = bpy.data.node_groups.new(
        "Native fence alpha compositor", "CompositorNodeTree"
    )
    scene.compositing_node_group = compositor
    nodes = compositor.nodes
    links = compositor.links
    render_layers = nodes.new("CompositorNodeRLayers")
    alpha_threshold = nodes.new("ShaderNodeMath")
    alpha_threshold.operation = "GREATER_THAN"
    alpha_threshold.inputs[1].default_value = 0.0
    set_alpha = nodes.new("CompositorNodeSetAlpha")
    set_alpha.inputs["Type"].default_value = "Replace Alpha"
    output = nodes.new("NodeGroupOutput")
    compositor.interface.new_socket(
        name="Image", in_out="OUTPUT", socket_type="NodeSocketColor"
    )
    links.new(render_layers.outputs["Image"], set_alpha.inputs["Image"])
    links.new(render_layers.outputs["Alpha"], alpha_threshold.inputs[0])
    links.new(alpha_threshold.outputs[0], set_alpha.inputs["Alpha"])
    links.new(set_alpha.outputs["Image"], output.inputs["Image"])

    world = bpy.data.worlds.new("Fence render world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.75, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.42
    scene.world = world

    bpy.ops.object.light_add(type="AREA", location=(-4.0, -6.0, 10.0))
    key = bpy.context.object
    key.name = "Soft northwest key"
    key.data.energy = 580.0
    key.data.shape = "DISK"
    key.data.size = 6.0
    key.data.color = (1.0, 0.95, 0.86)

    bpy.ops.object.light_add(type="AREA", location=(6.0, 2.0, 5.0))
    fill = bpy.context.object
    fill.name = "Cool camera fill"
    fill.data.energy = 170.0
    fill.data.size = 7.0
    fill.data.color = (0.72, 0.82, 1.0)

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Canonical 96x54 board camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ORTHO_SCALE
    # The rail render seats world origin on the board diamond's front contact
    # point.  The post render re-aims the same camera so the post's lowest pixel
    # seats at the runtime post anchor instead.
    aim_camera_for_origin_y(camera, 95)
    scene.camera = camera
    return camera


def set_render_collection(
    active: bpy.types.Collection,
    candidates: list[bpy.types.Collection],
) -> None:
    for collection in candidates:
        collection.hide_render = collection != active


def render_candidate(
    filename: str,
    active: bpy.types.Collection,
    candidates: list[bpy.types.Collection],
    camera: bpy.types.Object,
    origin_y: float,
) -> None:
    set_render_collection(active, candidates)
    aim_camera_for_origin_y(camera, origin_y)
    bpy.context.scene.render.filepath = str(HERE / filename)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    reset_scene()
    # The .blend is generated output; avoid accumulating Blender's numbered
    # backup beside it on every deterministic rebuild.
    bpy.context.preferences.filepaths.save_version = 0
    material = make_stone_material()

    rail_e = bpy.data.collections.new("Candidate - stone rail E")
    rail_s = bpy.data.collections.new("Candidate - stone rail S")
    post = bpy.data.collections.new("Candidate - stone terminal post")
    bpy.context.scene.collection.children.link(rail_e)
    bpy.context.scene.collection.children.link(rail_s)
    bpy.context.scene.collection.children.link(post)

    create_rail("E rail", "Y", rail_e, material)
    create_rail("S rail", "X", rail_s, material)
    create_terminal_post(post, material)
    camera = configure_scene()

    candidates = [rail_e, rail_s, post]
    render_candidate("stone-rail-e-native-96x180.png", rail_e, candidates, camera, 95)
    render_candidate("stone-rail-s-native-96x180.png", rail_s, candidates, camera, 95)
    # With this model's 0.76-unit cap, origin y=65 seats the alpha bbox's last
    # row at y=68, matching the post contact anchor.
    render_candidate("stone-terminal-post-native-96x180.png", post, candidates, camera, 65)

    for collection in candidates:
        collection.hide_render = False
    aim_camera_for_origin_y(camera, 95)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "stone-fence-native-source.blend"))
    print(f"STONE_FENCE_NATIVE_DONE {HERE}")


if __name__ == "__main__":
    main()
