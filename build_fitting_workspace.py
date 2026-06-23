import bpy, os, math, mathutils, numpy as np
FBX = os.path.join(os.environ["TEMP"], "crown_extract", "source", "Kings Crown Sketchfab.fbx")
TEX = os.path.join(os.environ["TEMP"], "crown_extract", "textures")
PIECES = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof\armor_pieces.blend"
OUT = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\king-proof"

scene = bpy.context.scene
king = next(o for o in scene.objects if o.name == "king")
n=len(king.data.vertices); a=np.empty(n*3); king.data.vertices.foreach_get("co",a); kc=a.reshape(-1,3)
head = kc[kc[:,2] > 1.45]; head_w = 2*np.sqrt(head[:,0]**2 + head[:,1]**2).max()

# --- crown: import, fit on head as a starting placement, PBR gold material ---
bpy.ops.import_scene.fbx(filepath=FBX)
ms=[o for o in scene.objects if o.type=="MESH" and o.name not in ("king",)]
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active=ms[0]
if len(ms)>1: bpy.ops.object.join()
cr=bpy.context.view_layer.objects.active; cr.name="CROWN"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def cco():
    a=np.empty(len(cr.data.vertices)*3); cr.data.vertices.foreach_get("co",a); return a.reshape(-1,3)
c=cco(); mn=c.min(0); mx=c.max(0); cw=max(mx[0]-mn[0], mx[1]-mn[1]); s=(1.18*head_w)/cw; ctr=(mn+mx)/2
cr.location=(-ctr[0]*s,-ctr[1]*s,0); cr.scale=(s,s,s); bpy.ops.object.transform_apply(location=True, scale=True)
c=cco(); cxy=(c.min(0)+c.max(0))/2; cr.location=(-cxy[0],-cxy[1],1.50-c.min(0)[2]); bpy.ops.object.transform_apply(location=True)
bpy.ops.object.shade_smooth()
m=bpy.data.materials.new("crown_pbr"); m.use_nodes=True; nt=m.node_tree; bsdf=nt.nodes.get("Principled BSDF")
def tex(f,cs):
    img=bpy.data.images.load(os.path.join(TEX,f)); img.colorspace_settings.name=cs
    nn=nt.nodes.new("ShaderNodeTexImage"); nn.image=img; return nn
nt.links.new(tex("Kings Crown 2_Crown_BaseColor.png","sRGB").outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tex("Kings Crown 2_Crown_Metallic.png","Non-Color").outputs["Color"], bsdf.inputs["Metallic"])
nt.links.new(tex("Kings Crown 2_Crown_Roughness.png","Non-Color").outputs["Color"], bsdf.inputs["Roughness"])
nmap=nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(tex("Kings Crown 2_Crown_Normal.png","Non-Color").outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
cr.data.materials.clear(); cr.data.materials.append(m)

# --- append the armor pieces, parked in a row beside the king (-X), keep their materials ---
names = ["HELMET","PAULDRON_L","PAULDRON_R","CAPE","PLUME"]
with bpy.data.libraries.load(PIECES, link=False) as (src, dst):
    dst.objects = [nm for nm in names if nm in src.objects]
for i, o in enumerate(dst.objects):
    if o is None: continue
    scene.collection.objects.link(o)
    b=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get("co",b); bc=b.reshape(-1,3); ctr=(bc.min(0)+bc.max(0))/2
    o.location = (-1.6 - i*0.7 - ctr[0], -ctr[1], 1.0 - ctr[2])   # park to the left, around king mid-height
print("workspace pieces:", [o.name for o in scene.objects if o.type=="MESH"])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "king_fitting_workspace.blend"))
print("saved king_fitting_workspace.blend")
