"""Open the posed knight in an interactive Blender session for inspection.

Launch (GUI, not --background):
    blender --python knight_view.py
"""

import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import knight_build as K  # noqa: E402
import pieces_claude as P  # noqa: E402

# build the posed knight (head + base) exactly as the catalog render does
K.assemble(*K.ORIENT)
P.setup_board_camera(K.TARGET_H * 0.5, K.TARGET_H * 1.6)

# look through the board camera and use material-preview shading so the navy
# stone is visible right away
try:
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.region_3d.view_perspective = "CAMERA"
                    space.shading.type = "MATERIAL"
except Exception as exc:  # non-fatal: user can frame it manually
    print("viewport setup skipped:", exc)

bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "knight.blend"))
print("KNIGHT_VIEW_READY")
