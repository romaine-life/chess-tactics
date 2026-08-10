"""The pixel-filter settings Nelson tuned by eye, as the reproducible spec.

Found in the Blender To Pixels lab (`build_pixel_filter_lab.py`) on the pawn at the
game's true-isometric contract angle, then read back out of the saved file rather
than transcribed, so these are the values that actually produced the approved frame.

This is the whole reason the filter had to be deterministic rather than an img2img
restyle: a zoom-rung ladder needs the same treatment reproduced at several sizes, and
a prompt cannot promise that. These numbers can.

Two of them are counter-intuitive enough to be worth calling out before someone
"fixes" them:

  filter_size 0.01 -- Blender reconstructs each pixel through a 1.5px filter by
  default, which at these sizes smears the result. Nearly zero keeps the render
  hard-edged, which is what survives the pixelate stage.

  ColorRamp stops are LINEAR positions. The compositor works in linear space while an
  exported PNG is display-encoded, and sRGB 0.35 is linear 0.10 -- placing stops from
  PNG-measured percentiles puts them above almost every pixel and collapses the whole
  piece onto the first colour.
"""

RENDER = {
    "engine": "CYCLES",
    "samples": 256,
    "resolution": (512, 512),
    "filter_size": 0.01,
    "film_transparent": True,
    "view_transform": "Standard",
    "use_compositing": True,
}

PIXELATE = {"Size": 7}

OUTLINE = {
    "Color": "#181818",
    "Fine Adjust": 1.0,
    "Sensitivity": 5.0,
}

# CONSTANT interpolation is what makes this a palette rather than a gradient: every
# pixel snaps to a stop instead of being interpolated between them.
COLOR_RAMP = {
    "interpolation": "CONSTANT",
    "stops": [
        (0.00000, "#0d1526"),
        (0.05139, "#172a4a"),
        (0.09918, "#223866"),
        (0.15729, "#2f4a83"),
        (0.28899, "#415f9c"),
    ],
}

# Left at defaults: the palette is carried by the ColorRamp above, so the 8-material
# combiner is not in play. Recorded so a later pass knows it was deliberate.
DITHERER = {"Posterize Levels": 8.0, "Dither Amount": 0.25}

# Tuned on the pawn only. The other five pieces have their own silhouettes -- the
# rook is ten separate meshes and takes far more outline than a smooth pawn does --
# so treat these as the starting point per piece, not as settled for the roster.
TUNED_ON = "pawn"
