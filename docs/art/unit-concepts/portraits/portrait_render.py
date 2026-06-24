import bpy, os, sys, math, mathutils, numpy as np
# args: BLEND OUTFILE PALETTE R G B ACCENT(keep|iron) HERO_YAW [METAL ROUGH]
a = sys.argv[sys.argv.index("--")+1:]
BLEND, OUTFILE, PALETTE = a[0], a[1], a[2]
BODY = (float(a[3]), float(a[4]), float(a[5]), 1.0)
ACCENT = a[6]; HERO_YAW = float(a[7])
BODY_METAL = float(a[8]) if len(a) > 8 else -1.0
BODY_ROUGH = float(a[9]) if len(a) > 9 else -1.0
os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)
sc = bpy.context.scene

def set_base(b, rgba):
    inp=b.inputs["Base Color"]
    for l in list(inp.links): b.id_data.links.remove(l)
    inp.default_value=rgba
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    b=mat.node_tree.nodes.get("Principled BSDF")
    if not b: continue
    if mat.name.lower().startswith("navy stone"):
        set_base(b, BODY)
        if BODY_METAL>=0: b.inputs["Metallic"].default_value=BODY_METAL
        if BODY_ROUGH>=0: b.inputs["Roughness"].default_value=BODY_ROUGH
    elif ACCENT=="iron":
        set_base(b,(0.05,0.05,0.06,1.0)); b.inputs["Metallic"].default_value=1.0; b.inputs["Roughness"].default_value=0.38

# unit bounds (world) to frame the bust adaptively
pts=[]
for o in [o for o in sc.objects if o.type=="MESH"]:
    for v in o.data.vertices: pts.append(o.matrix_world @ v.co)
P=np.array([[p.x,p.y,p.z] for p in pts]); topZ=float(P[:,2].max())
# full-figure framing: fit the whole piece with a small floor margin so the base
# is never sliced (the HUD anchors object-position:center bottom). The flared base
# tilts toward the camera, so it needs extra floor room beyond the naive window.
TZ_F = float(os.environ.get("PORTRAIT_TZ", "0.49"))
SPAN_F = float(os.environ.get("PORTRAIT_SPAN", "1.24"))
Tz = TZ_F*topZ              # look-at below centre -> lifts the piece off the bottom edge
span = SPAN_F*topZ          # world-vertical height to fit
LENS=55.0; SENSOR=36.0
vfov = 2*math.atan((SENSOR/2)/LENS)
D = (span/2)/math.tan(vfov/2)
E = math.radians(10.0); A = math.radians(HERO_YAW)
for c in [o for o in sc.objects if o.type=="CAMERA"]: bpy.data.objects.remove(c, do_unlink=True)
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam
cam.location=(D*math.cos(E)*math.sin(A), -D*math.cos(E)*math.cos(A), Tz + D*math.sin(E))
T=mathutils.Vector((0,0,Tz))
cam.rotation_euler=(T-cam.location).to_track_quat("-Z","Y").to_euler()
cam.data.type="PERSP"; cam.data.lens=LENS; cam.data.sensor_width=SENSOR
sc.render.engine="CYCLES"; sc.cycles.samples=64; sc.cycles.use_denoising=True
sc.view_settings.view_transform="Standard"
sc.render.resolution_x=sc.render.resolution_y=512; sc.render.film_transparent=True
sc.render.image_settings.file_format="PNG"; sc.render.filepath=OUTFILE
bpy.ops.render.render(write_still=True)
print("PORTRAIT_DONE topZ=%.2f Tz=%.2f D=%.2f ->" % (topZ,Tz,D), OUTFILE)
