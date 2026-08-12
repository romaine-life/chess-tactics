"""Split the king's crown into velvet and gold materials by its own region map.

The mesh already carries a `Col` corner attribute of flat region IDs -- rendering it
flat identifies them: pure red marks the velvet panels, green the gold arches, cyan
the pearls, magenta the circlet. That map is what the original art pipeline used to
tell those regions apart, so splitting on it is reading the model rather than
inventing a division.

Velvet becomes its own material with its own Pass Index, which is the only thing that
lets the compositor's ID Mask give it a separate palette. Gold and velvet share one
material otherwise, and no ramp edit can make one of them red.
"""
import bpy, os

bpy.ops.wm.open_mainfile(filepath=os.environ["SRC"])
crown = bpy.data.objects["CROWN"]
mesh = crown.data
attr = mesh.color_attributes[0]

gold = mesh.materials[0]
velvet = gold.copy()
velvet.name = "crown_velvet"
mesh.materials.append(velvet)
velvet_slot = len(mesh.materials) - 1

# Velvet is red-and-only-red: r high, g and b low. Thresholding each channel rather
# than multiplying raw values keeps the near-red finial out of it, and the corner
# attribute is interpolated so a face is judged by its average.
moved = 0
for poly in mesh.polygons:
    reds = []
    for li in poly.loop_indices:
        c = attr.data[li].color
        reds.append(1.0 if (c[0] > 0.5 and c[1] < 0.15 and c[2] < 0.5) else 0.0)
    if sum(reds) / max(1, len(reds)) > 0.5:
        poly.material_index = velvet_slot
        moved += 1

print("SPLIT velvet faces", moved, "of", len(mesh.polygons))
bpy.ops.wm.save_as_mainfile(filepath=os.environ["OUT"])
print("SPLIT_SAVED", os.environ["OUT"])
