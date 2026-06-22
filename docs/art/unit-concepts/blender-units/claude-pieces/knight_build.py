"""Build the knight from the cached armored horse head.

Reuses pieces_claude for stone material / lighting / board camera. Run:
    blender --background --python knight_build.py -- orient   # render rotation candidates
    blender --background --python knight_build.py             # full 8-dir into catalog
"""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pieces_claude as P  # noqa: E402

HEAD_GLB = HERE / "knight-head.glb"
# A chess piece is a turned column with a motif on top. Build the column (foot +
# neck) in the set's lathe language, then fuse the horse head onto the TOP third.
TARGET_H = 2.2          # total piece height
HEAD_H = 0.92           # the horse head occupies only the top ~third (a motif)
NECK_TOP = 1.48         # the turned neck column rises to here; head caps it
HEAD_DROP = 0.12        # head sinks into the column top for a clean fuse
ORIENT = (-104, 0, 0)   # head tilt where it sits on the column (tune via 'orient')


def bbox(o):
    mn = Vector((1e18,) * 3)
    mx = Vector((-1e18,) * 3)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
        mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def data_bounds(mesh):
    vs = mesh.vertices
    xs = [v.co.x for v in vs]
    ys = [v.co.y for v in vs]
    zs = [v.co.z for v in vs]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def import_head(rx, ry, rz, material):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(HEAD_GLB))
    imported = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]
    # bake each object's world transform into its mesh data, then zero the object
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_basis = Matrix.Identity(4)
        o.data.transform(mw)
        o.data.update()
    for o in imported:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    head = meshes[0]
    md = head.data
    # everything below transforms the MESH DATA directly (reliable in --background)
    R = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), "XYZ").to_matrix().to_4x4()
    md.transform(R)
    mn, mx = data_bounds(md)
    s = HEAD_H / (mx.z - mn.z)
    md.transform(Matrix.Scale(s, 4))
    mn, mx = data_bounds(md)
    # sit the head on top of the neck column, sinking in by HEAD_DROP to fuse
    md.transform(Matrix.Translation(Vector((-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, (NECK_TOP - HEAD_DROP) - mn.z))))
    md.update()
    md.materials.clear()
    md.materials.append(material)
    for p in md.polygons:
        p.use_smooth = True
    return head


def build_body(material):
    # Turned chess-piece column in the set's lathe language: flared foot + collar,
    # then a neck rising to NECK_TOP where the horse head caps it.
    profile = [
        (0.00, 0.00), (0.47, 0.00), (0.47, 0.05), (0.39, 0.085), (0.42, 0.12),
        (0.37, 0.19), (0.31, 0.28), (0.295, 0.35),
        (0.315, 0.40), (0.305, 0.45),
        (0.25, 0.60), (0.225, 0.82), (0.225, 1.05), (0.25, 1.26),
        (0.285, NECK_TOP - 0.06), (0.30, NECK_TOP),
    ]
    return P.lathe("knight_body", profile, material, smooth=2)


def assemble(rx, ry, rz):
    P.clear_scene()
    P.setup_world()
    P.setup_lighting()
    m = P.stone()
    body = build_body(m)
    head = import_head(rx, ry, rz, m)
    # fuse the head onto the top of the turned column -> one carved piece
    P.boolean(body, head, "UNION")
    bev = body.modifiers.new("seam_bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 2
    bev.use_clamp_overlap = True
    body.modifiers.new("seam_wn", "WEIGHTED_NORMAL")
    for poly in body.data.polygons:
        poly.use_smooth = True
    pivot = bpy.data.objects.new("knight_pivot", None)
    bpy.context.collection.objects.link(pivot)
    body.parent = pivot
    return pivot


def render_orient_candidates():
    for tag, (rx, ry, rz) in {
        "rx-50": (-50, 0, 0),
        "rx-65": (-65, 0, 0),
        "rx-80": (-80, 0, 0),
        "rx-110": (-110, 0, 0),
        "rx-130": (-130, 0, 0),
    }.items():
        assemble(rx, ry, rz)
        P.setup_board_camera(TARGET_H * 0.5, TARGET_H * 1.4)
        P.setup_render()
        bpy.context.scene.render.filepath = str(HERE / f"knight-rot-{tag}.png")
        bpy.ops.render.render(write_still=True)
        print(f"ORIENT_DONE {tag} ({rx},{ry},{rz})")


def render_catalog():
    pivot = assemble(*ORIENT)
    P.setup_board_camera(TARGET_H * 0.5, TARGET_H * 1.6)
    P.setup_render()
    out = P.FRONTEND_UNITS / "knight" / "candidate-claude"
    out.mkdir(parents=True, exist_ok=True)
    for direction, angle in P.DIRECTIONS.items():
        pivot.rotation_euler[2] = math.radians(angle)
        bpy.context.scene.render.filepath = str(out / f"{direction}.png")
        bpy.ops.render.render(write_still=True)
    pivot.rotation_euler[2] = 0
    bpy.context.scene.render.filepath = str(HERE / "knight-south.png")
    bpy.ops.render.render(write_still=True)
    print(f"KNIGHT_DONE -> {out}")


def render_preview():
    assemble(*ORIENT)
    P.setup_board_camera(TARGET_H * 0.5, TARGET_H * 1.6)
    P.setup_render()
    bpy.context.scene.render.filepath = str(HERE / "knight-pose-preview.png")
    bpy.ops.render.render(write_still=True)
    print("PREVIEW_DONE")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "orient" in argv:
        render_orient_candidates()
    elif "preview" in argv:
        render_preview()
    else:
        render_catalog()
    print("KNIGHT_BUILD_DONE")
