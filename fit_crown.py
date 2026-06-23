import bpy, os, math, mathutils, numpy as np
FBX = os.path.join(os.environ["TEMP"], "crown_extract", "source", "Kings Crown Sketchfab.fbx")
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"
# tunables
WIDTH_FACTOR = 1.18   # crown band width / king head width
BAND_Z       = 1.50   # z of the crown band bottom (where it grips the head)

scene = bpy.context.scene
king = next(o for o in scene.objects if o.name == "king")
n=len(king.data.vertices); a=np.empty(n*3); king.data.vertices.foreach_get("co",a); kc=a.reshape(-1,3)
head = kc[kc[:,2] > 1.45]
head_w = 2*np.sqrt(head[:,0]**2 + head[:,1]**2).max()
print("king head width=%.3f" % head_w)

bpy.ops.import_scene.fbx(filepath=FBX)
ms=[o for o in scene.objects if o.type=="MESH" and o.name != "king"]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active=ms[0]
if len(ms)>1: bpy.ops.object.join()
cr=bpy.context.view_layer.objects.active; cr.name="crown"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def cco():
    a=np.empty(len(cr.data.vertices)*3); cr.data.vertices.foreach_get("co",a); return a.reshape(-1,3)
c=cco(); mn=c.min(0); mx=c.max(0); cw=max(mx[0]-mn[0], mx[1]-mn[1])
s=(WIDTH_FACTOR*head_w)/cw
ctr=(mn+mx)/2
cr.location=(-ctr[0]*s, -ctr[1]*s, 0); cr.scale=(s,s,s)
bpy.ops.object.transform_apply(location=True, scale=True)
c=cco(); cmn=c.min(0); cmx=c.max(0); cxy=(cmn+cmx)/2
cr.location=(-cxy[0], -cxy[1], BAND_Z - cmn[2])   # band bottom at BAND_Z
bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
# restore the crown's real material from its PBR textures (UVs come from the FBX)
TEX = os.path.join(os.environ["TEMP"], "crown_extract", "textures")
m=bpy.data.materials.new("crown_pbr"); m.use_nodes=True
nt=m.node_tree; bsdf=nt.nodes.get("Principled BSDF")
def tex(fname, cs):
    img=bpy.data.images.load(os.path.join(TEX, fname)); img.colorspace_settings.name=cs
    n=nt.nodes.new("ShaderNodeTexImage"); n.image=img; return n
base=tex("Kings Crown 2_Crown_BaseColor.png","sRGB"); nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
met=tex("Kings Crown 2_Crown_Metallic.png","Non-Color"); nt.links.new(met.outputs["Color"], bsdf.inputs["Metallic"])
rough=tex("Kings Crown 2_Crown_Roughness.png","Non-Color"); nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
nrm=tex("Kings Crown 2_Crown_Normal.png","Non-Color"); nmap=nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
cr.data.materials.clear(); cr.data.materials.append(m)
scene.render.filepath=os.path.join(OUT,"king_crown_south")
bpy.ops.render.render(write_still=True)
# front view too
bpy.ops.object.camera_add(location=(0,-5,1.0)); fc=bpy.context.object
fc.rotation_euler=(mathutils.Vector((0,0,1.0))-fc.location).to_track_quat("-Z","Y").to_euler()
fc.data.type="ORTHO"; fc.data.ortho_scale=2.7; scene.camera=fc
scene.render.filepath=os.path.join(OUT,"king_crown_front")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,"king_crown.blend"))
print("rendered king_crown south + front; saved king_crown.blend")
