"""Normalize a generated backdrop to the 640x360 screen-art review plate.

Generators do not emit 16:9 (gpt-image favours 3:2 / square; PixelLab caps at
688x384), but the Screen Art studio compares plates at one framing and ships them
at exactly 4x. Centre-crop to 16:9, then resample to 640x360.

The NATIVE bytes are what gets installed later -- acceptance attests native 1x --
so this only ever writes a separate review plate and never touches the input.

    python normalize-screen-plate.py <in.png> <out.png>
"""
import sys

from PIL import Image

PLATE = (640, 360)


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert("RGB")
    width, height = im.size
    target = PLATE[0] / PLATE[1]
    if width / height > target:
        crop = int(round(height * target))
        left = (width - crop) // 2
        im = im.crop((left, 0, left + crop, height))
    else:
        crop = int(round(width / target))
        top = (height - crop) // 2
        im = im.crop((0, top, width, top + crop))
    im.resize(PLATE, Image.LANCZOS).save(dst)
    print(f"{dst} {PLATE[0]}x{PLATE[1]} (from {width}x{height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
