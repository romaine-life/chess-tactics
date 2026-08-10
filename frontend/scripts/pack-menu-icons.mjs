#!/usr/bin/env node
// pack-menu-icons.mjs — FIT a menu-icon set onto the canonical icon canvas
// (ADR-0026: one fixed 64x64 transparent canvas) so every mark in the set draws at
// ONE size and sits on ONE centre line.
//
// The rule is deliberately blunt: each glyph's INK is scaled until its long axis is
// exactly --box px, then the ink box is centred in the canvas on both axes. Optical
// centring is frozen as the asset's own transparent padding, so downstream centres
// naively and gets it for free — the seat never carries a per-icon nudge.
//
// This replaces the per-shape optical KEYLINE table this script used to carry
// (ADR-0027 §C: blade 56 / route-map 52 / scroll 48 / pawns 48 / gear 52). Keylines
// equalize optical MASS, which is the right call for a dense functional set read as
// symbols. On this rail they made the set read as five different sizes — the widest
// gap was a 40px glyph beside a 56px one, a 40% difference on a five-item column
// where the marks stack vertically and every neighbour is a size reference. A single
// box is what the owner asked for and what the rail shows.
//
// Mechanical compositor — it does NOT generate art. Sources are the highest-fidelity
// renders available, so the resize is a clean LANCZOS DOWNscale (ADR-0014: the
// downscale IS the pixelation), then MEDIANCUT-quantized to a limited palette and
// snapped onto the canvas on whole pixels.
//
// Sources must be fetched from live media or a generator's temporary directory.
// Outputs are temporary candidates:
//   node scripts/pack-menu-icons.mjs --source-dir <fetched> --out-dir <temp> [--box 52]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { inkBounds } from './trim-icon-margin.mjs';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const sourceOption = option('source-dir');
const outputOption = option('out-dir');
if (!sourceOption || !outputOption) {
  console.error('Usage: node scripts/pack-menu-icons.mjs --source-dir <fetched> --out-dir <temp-output> [--box 52] [--canvas 64] [--colors 48] [--alpha 24]');
  process.exit(2);
}
const PY = process.env.FORGE_PY || process.env.PYTHON || 'python';
const SOURCE_DIR = resolve(sourceOption);
const OUT_DIR = resolve(outputOption);
mkdirSync(OUT_DIR, { recursive: true });

const CANVAS = Number(option('canvas', 64));
const COLORS = Number(option('colors', 48));
/** The alpha floor that counts as ink. Shared with trim-icon-margin/verify-icon-seats so
 *  the number this script fits to is the number every other tool measures. */
const ALPHA = Number(option('alpha', 24));
/**
 * THE ink HEIGHT, in px on the canvas, that every glyph is scaled to.
 *
 * Height and not the long axis. Pinning the long axis equalizes size but NOT vertical
 * padding: a mark wider than it is tall spends the box on its width and comes back
 * short, so it sits with more room above and below it than its neighbours — the rail
 * then has marks at one size sitting on different amounts of air. The rail stacks these
 * five in a column against a shared button frame, so the gap above and below each mark
 * is the thing the eye actually compares. Pin the height and every mark in the set has
 * identical top and bottom padding to its button by construction.
 *
 * 52 of 64 = 0.8125, inside the 62-84% band ApparatusRailTab's 'inset' mark canvas
 * assumes (a glyph that reserves its own canvas margin), so the seat keeps drawing the
 * whole 64px asset at --settings-tab-icon-size and needs no new rule.
 *
 * Width follows the aspect and is only bounded by the canvas. A subject too wide to fit
 * at this height is REFUSED rather than quietly shrunk, because shrinking it is exactly
 * the unequal padding this rule exists to remove — the fix is a subject that is not that
 * wide (three marks in a row become three upright marks), not a smaller mark.
 */
const BOX = Number(option('box', 52));
if (!Number.isInteger(BOX) || BOX < 8 || BOX > CANVAS) {
  console.error(`--box must be an integer from 8 through the canvas size (${CANVAS})`);
  process.exit(2);
}

// Fit is iterative because the two steps disagree by up to a pixel: LANCZOS lays a soft
// fringe outside the shape, and clamping that fringe below the ink threshold can drop the
// outermost row back off again. Re-measuring the ACTUAL ink after each attempt and
// correcting the resize converges in one or two passes, and asserting afterwards means a
// non-converging glyph fails loudly instead of shipping a size nobody checked.
//
// Both ink dimensions are pinned EVEN. An odd dimension cannot sit on the centre of an
// even canvas — `(64 - 49) / 2` is 7.5, so the glyph resolves half a pixel off and the
// margin above it differs from the margin below by one canvas pixel. That is small in the
// file and not small on the rail: the canvas is drawn at 44px inside a 61px button, where
// a mark that is a pixel high reads as a mark that is not centred. The long axis is `box`
// and even by construction; only the short axis is ever nudged, by at most one pixel
// against a dimension of 25 or more, which is under a 4% change to an aspect nothing else
// depends on.
const PYSRC = `
from PIL import Image
import sys
src, box, canvas, colors, alpha, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]

def clamp(im):
    """Drop every pixel at or below the ink threshold, so the measured box is the drawn box."""
    a = im.split()[3].point(lambda v: v if v > alpha else 0)
    im.putalpha(a)
    return im

def ink(im):
    a = im.split()[3].point(lambda v: 255 if v > alpha else 0)
    return a.getbbox()

def even(value, limit):
    """Round to an even number, toward the long axis so a glyph never shrinks below itself."""
    if value % 2 == 0:
        return value
    return value + 1 if value < limit else value - 1

im = clamp(Image.open(src).convert('RGBA'))
bbox = ink(im)
if bbox is None:
    print('EMPTY'); sys.exit(3)
im = im.crop(bbox)

w, h = im.size
target_h = box
target_w = even(max(2, round(w * box / h)), box)
if target_w > canvas:
    print(f'TOO_WIDE {target_w}')
    sys.exit(6)

# The resize dimensions and the ink they PRODUCE are not the same number once the fringe
# is clamped, so drive the resize by the error against the target rather than assuming it.
resize_w, resize_h = target_w, target_h
for _ in range(8):
    scaled = clamp(im.resize((max(1, resize_w), max(1, resize_h)), Image.LANCZOS))
    measured = ink(scaled)
    if measured is None:
        print('VANISHED'); sys.exit(4)
    ink_w, ink_h = measured[2] - measured[0], measured[3] - measured[1]
    if (ink_w, ink_h) == (target_w, target_h):
        break
    resize_w += target_w - ink_w
    resize_h += target_h - ink_h
else:
    print('NO_CONVERGE'); sys.exit(5)

scaled = scaled.crop(measured)
a = scaled.split()[3]
rgb = scaled.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT).convert('RGBA')
rgb.putalpha(a)
nw, nh = rgb.size

cv = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
# Both dimensions are even against an even canvas, so this division is exact: the ink box
# carries identical transparent margin above and below, and left and right.
x = (canvas - nw) // 2
y = (canvas - nh) // 2
cv.alpha_composite(rgb, (x, y))
ncols = len(cv.convert('RGB').getcolors(maxcolors=100000) or [None] * 99999)
cv.save(out)
print(f'{canvas}x{canvas} | ink {nw}x{nh} @ ({x},{y}) | margin y {y}/{canvas - y - nh} | colors {ncols}')
`;

const sources = readdirSync(SOURCE_DIR).filter((name) => name.toLowerCase().endsWith('.png')).sort();
if (!sources.length) {
  console.error(`No .png sources in ${SOURCE_DIR}`);
  process.exit(2);
}

let failed = 0;
const packed = [];
for (const name of sources) {
  const src = join(SOURCE_DIR, name);
  const out = join(OUT_DIR, name);
  const result = spawnSync(
    PY,
    ['-c', PYSRC, src, String(BOX), String(CANVAS), String(COLORS), String(ALPHA), out.replace(/\\/g, '/')],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const reported = (result.stdout || '').trim();
    const tooWide = reported.match(/^TOO_WIDE (\d+)$/);
    console.error(tooWide
      ? `FAIL ${name}: at ${BOX}px tall this subject is ${tooWide[1]}px wide, past the ${CANVAS}px canvas. `
        + 'Every mark is pinned to one height so the whole set shares one top and bottom margin; '
        + 'a subject this wide has to become a narrower arrangement, not a shorter mark.'
      : `FAIL ${name}: ${reported} ${result.stderr || result.error || ''}`.trim());
    failed += 1;
    continue;
  }
  process.stdout.write(`  ${basename(name).padEnd(24)} ${result.stdout.trim()}\n`);
  packed.push(out);
}

// Verify the written BYTES, not the intent. The fit only matters because the seat draws
// the whole canvas and lets the asset's padding decide the glyph's size and centre — so a
// packed file that drifted by a pixel is a rail that draws one mark off the line, with
// nothing pointing at the cause. Measured with the same shared primitive the trim tool and
// the title-bar seat gate use.
const failures = [];
for (const file of packed) {
  const png = PNG.sync.read(readFileSync(file));
  const box = inkBounds(png, ALPHA);
  const label = basename(file);
  if (!box) { failures.push(`${label}: packed to an empty canvas`); continue; }
  if (png.width !== CANVAS || png.height !== CANVAS) {
    failures.push(`${label}: canvas is ${png.width}x${png.height}, expected ${CANVAS}x${CANVAS}`);
    continue;
  }
  if (box.height !== BOX) {
    failures.push(`${label}: ink is ${box.height}px tall, expected exactly ${BOX}px (ink ${box.width}x${box.height})`);
  }
  // EXACTLY centred, not centred-to-within-a-pixel. The seat draws this canvas at 44px in
  // a 61px button and lets the asset's own padding place the mark, so one pixel of margin
  // difference in the file is a mark that visibly does not sit on the button's centre line.
  const marginTop = box.y;
  const marginBottom = CANVAS - (box.y + box.height);
  const marginLeft = box.x;
  const marginRight = CANVAS - (box.x + box.width);
  if (marginTop !== marginBottom || marginLeft !== marginRight) {
    failures.push(
      `${label}: margins are top ${marginTop} / bottom ${marginBottom}, left ${marginLeft} / right ${marginRight} — `
      + `every pair must be equal (ink ${box.width}x${box.height} at (${box.x},${box.y}) on ${CANVAS}x${CANVAS})`,
    );
  }
}

if (failed || failures.length) {
  if (failures.length) {
    console.error('\n✗ Packed icons FAILED the uniform-box check:');
    for (const failure of failures) console.error(`  - ${failure}`);
  }
  if (failed) console.error(`\n${failed} icon(s) failed to pack.`);
  process.exit(1);
}
console.log(`\n✓ ${packed.length} icon(s) packed to ${CANVAS}x${CANVAS}: every ink exactly ${BOX}px tall, with equal margin above and below and left and right — so the whole set shares one top and bottom padding on the rail.`);
console.log('Upload the packed files as live-media candidates; this script does not publish repository media.');
