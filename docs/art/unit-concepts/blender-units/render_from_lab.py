"""Render a sprite ladder FROM the owner's saved lab file.

The lab and the renderer were separate: the lab was where tuning happened, and the
renderer rebuilt an approximation of it from constants in a script. Every rebuild
therefore reset whatever had been tuned since the constants were last copied across
by hand -- block size, outline sensitivity and the crown's ramps have each been lost
that way. This opens the lab and drives it, so there is one artifact and no copy.

The ONLY things touched are the ones a ladder must vary: the body ramp's COLOURS for
a team palette (its stop POSITIONS are the owner's and are left alone), the render
resolution for a rung, and the model's yaw for a facing. Everything else -- accent
chains, masks, dilate, pixelate, switches -- renders exactly as saved.
"""
import bpy, os, math, numpy as np

LAB   = os.environ["LAB"]
OUT   = os.environ["OUT"]
BLOCK = None   # read from the lab below; the file states it, nothing else may
RUNGS = [int(x) for x in os.environ["RUNGS"].split(",") if x.strip()]
FRAME = (int(os.environ["SPRITE_PX"]), int(os.environ["SPRITE_PY"]))
PALETTE = os.environ.get("PALETTE", "")
SAMPLES = int(os.environ.get("SAMPLES", "64"))

DIRECTIONS = {"south": 0, "south-west": -45, "west": -90, "north-west": -135,
              "north": 180, "north-east": 135, "east": 90, "south-east": 45}
WANTED = [d for d in os.environ.get("DIRECTIONS", "south").split(",") if d]

# Team colours only. Positions come from the lab, never from here.
BODY_COLOURS = {
    "navy-blue": ["#0d1926", "#17314a", "#224466", "#2f5983", "#416e9c"],
    "white":     ["#3b3f47", "#717b8b", "#9daabf", "#ccdbf6", "#d7e6ff"],
    "golden":    ["#28200a", "#4f3d10", "#6c5519", "#8b6e25", "#a68637"],
    "emerald":   ["#0c2116", "#16412a", "#20593b", "#2c734e", "#3c8961"],
    "crimson":   ["#260c10", "#4a151d", "#66202a", "#832c39", "#9c3e4c"],
    "black":     ["#0d0e10", "#181c1f", "#22262b", "#2c3137", "#363b41"],
}
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

bpy.ops.wm.open_mainfile(filepath=LAB)
scene = next((s for s in bpy.data.scenes if getattr(s, "compositing_node_group", None)), None)
if scene is None:
    raise SystemExit("lab has no compositor")
bpy.context.window.scene = scene
tree = scene.compositing_node_group
print("LAB nodes=%d scene=%s" % (len(tree.nodes), scene.name))

if PALETTE:
    ramp = next((n for n in tree.nodes
                 if n.bl_idname in ("ShaderNodeValToRGB", "CompositorNodeValToRGB")
                 and (n.label or "").strip().upper().startswith("BODY")), None)
    if ramp is None:
        raise SystemExit("lab has no ramp labelled BODY")
    cols = BODY_COLOURS[PALETTE]
    els = ramp.color_ramp.elements
    if len(els) != len(cols):
        raise SystemExit("lab BODY ramp has %d stops, palette has %d" % (len(els), len(cols)))
    for el, hexv in zip(els, cols):
        r, g, b = (int(hexv[i:i+2], 16) / 255 for i in (1, 3, 5))
        el.color = (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)
    print("PALETTE applied=%s positions untouched=%s" % (PALETTE, [round(e.position, 5) for e in els]))

# The two switches a SHIPPING render must pin, named here rather than assumed: a board
# sprite needs its outline, and flares are a lighting flourish that the block collapse
# turns into scattered speckle. Everything else in the graph is the owner's and is left
# exactly as saved. SWITCHES=lab leaves even these two alone.
if os.environ.get("SWITCHES", "ship") == "ship":
    for n in tree.nodes:
        if n.bl_idname != "CompositorNodeSwitch":
            continue
        want = {"Outline": True, "Flares": False, "Fog": False}.get((n.label or "").strip())
        if want is not None:
            n.inputs["Switch"].default_value = want
            print("SWITCH %s=%s" % (n.label, want))

# Block size comes from the lab's own Pixelate nodes. It was an argument, which meant a
# number in a table had to be kept in step with a control the owner actually turns -- and
# it was not: the table said 6 for this piece while the file says 7. Every Pixelate in the
# graph is one stage of one filter and they must agree, so disagreement is an error rather
# than something to average.
# A BLOCK SIZE group drives every Pixelate stage from one Int, so the stages themselves
# read 1 and the group input is the real control -- which is the one the owner turns.
# Read the group first and fall back to the stages for a lab built before it existed.
BLOCK = None
for n in tree.nodes:
    if n.bl_idname != "CompositorNodeGroup" or not n.node_tree:
        continue
    if "BLOCK" not in (n.node_tree.name or "").upper():
        continue
    for inp in n.inputs:
        if inp.type in ("INT", "VALUE"):
            BLOCK = int(round(inp.default_value))
if BLOCK is None:
    _sizes = set()
    for n in tree.nodes:
        if n.bl_idname != "CompositorNodePixelate":
            continue
        for inp in n.inputs:
            if inp.name.lower() in ("size", "pixel size"):
                _sizes.add(int(round(inp.default_value)))
    if len(_sizes) != 1:
        raise SystemExit("lab Pixelate stages disagree on block size: %s" % sorted(_sizes))
    BLOCK = _sizes.pop()
if BLOCK < 1:
    raise SystemExit("lab reports a block size of %s" % BLOCK)
print("BLOCK from lab = %d" % BLOCK)

scene.cycles.samples = SAMPLES
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True

subject = next((o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render), None)
pivot = subject
for o in bpy.data.objects:
    if o.type == "EMPTY" and o.children:
        pivot = o
        break
base_yaw = pivot.rotation_euler.z if pivot else 0.0

def collapse(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    half = BLOCK // 2
    small = px[half::BLOCK, half::BLOCK]
    out = bpy.data.images.new("sprite", width=small.shape[1], height=small.shape[0], alpha=True)
    out.pixels = small.reshape(-1)
    out.file_format = "PNG"
    out.filepath_raw = path
    out.save()
    bpy.data.images.remove(img)
    bpy.data.images.remove(out)
    return small.shape[1], small.shape[0]

aspect = FRAME[1] / FRAME[0]
for rung in RUNGS:
    rh = int(round(rung * aspect))
    scene.render.resolution_x = rung * BLOCK
    scene.render.resolution_y = rh * BLOCK
    scene.render.resolution_percentage = 100
    for d in WANTED:
        if pivot:
            pivot.rotation_euler.z = base_yaw + math.radians(DIRECTIONS[d])
        path = os.path.join(OUT, str(rung), d + ".png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        w, h = collapse(path)
        print("WROTE %s %dx%d" % (path, w, h))
print("LAB_RENDER_DONE")
