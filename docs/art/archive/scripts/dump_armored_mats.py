import bpy, numpy as np
ob = next(o for o in bpy.data.objects if o.type == "MESH")
print("VERTS", len(ob.data.vertices))
print("MATERIAL_SLOTS", [s.material.name if s.material else None for s in ob.material_slots])
# how many loose islands? (cheap union-find over edges)
me = ob.data
nv = len(me.vertices)
parent = list(range(nv))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
ed = np.empty(len(me.edges)*2, dtype=np.int64); me.edges.foreach_get("vertices", ed); ed = ed.reshape(-1,2)
for a,b in ed:
    ra,rb = find(a), find(b)
    if ra != rb: parent[ra] = rb
roots = {}
for v in range(nv):
    r = find(v); roots[r] = roots.get(r,0)+1
islands = sorted(roots.values(), reverse=True)
print("LOOSE_ISLANDS", len(islands), "top sizes:", islands[:12])
