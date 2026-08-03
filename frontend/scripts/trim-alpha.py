"""Trim a keyed PNG to its object's alpha bounds.

A chroma-keyed generation carries however much flat background the model chose to
leave around the subject. For a mat that is mounted behind a card row, that padding
is not neutral: it silently changes the object's size relative to the cards. Cropping
to the alpha bounding box makes the uploaded bytes mean exactly "the object", so a
mount can size from the raster.

A low alpha cutoff keeps genuinely soft torn/frayed edges -- the whole point of the
silhouette -- while ignoring stray key residue.

    python trim-alpha.py <in.png> <out.png> [--cutoff 8]
"""
import sys

from PIL import Image

DEFAULT_CUTOFF = 8


def main() -> int:
    src, dst = sys.argv[1], sys.argv[2]
    cutoff = DEFAULT_CUTOFF
    if "--cutoff" in sys.argv:
        cutoff = int(sys.argv[sys.argv.index("--cutoff") + 1])

    im = Image.open(src).convert("RGBA")
    alpha = im.getchannel("A")
    box = alpha.point(lambda value: 255 if value > cutoff else 0).getbbox()
    if box is None:
        print(f"no opaque pixels above alpha {cutoff}", file=sys.stderr)
        return 1
    out = im.crop(box)
    out.save(dst)
    print(f"{out.width}x{out.height} trimmed from {im.width}x{im.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
