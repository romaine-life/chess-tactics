#!/usr/bin/env node
// Crop a pixel-art icon down to its own ink.
//
// Why this exists: a mark is drawn into a square seat with `contain`, which scales the
// CANVAS. Transparent margin baked into that canvas therefore comes straight off the
// drawn glyph — two icons with the same seat draw at different sizes purely because one
// carries more padding than the other. The Run's marks all ship trimmed, so the seat
// needs no per-icon compensation (see `.run-progress-icon img` in style.css); the kit's
// game glyphs do not, and each one that stays untrimmed costs a hand-copied number in
// CSS that goes stale the moment the art is regenerated.
//
// This is deterministic image logic, so it lives in git while the bytes it produces live
// in blob storage (docs/runtime-asset-contract.md). It does not draw art and it does not
// resample: every surviving pixel is byte-identical to the input, only the fully
// transparent border rows and columns are dropped.
//
//   node scripts/trim-icon-margin.mjs <in.png> <out.png> [--alpha 24] [--report]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

/**
 * The tightest box containing every pixel whose alpha exceeds `threshold`, or null when
 * the image is entirely transparent. The threshold ignores an antialias fringe that
 * would otherwise defeat the crop while contributing nothing visible.
 */
export function inkBounds(png, threshold = 24) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((png.width * y + x) << 2) + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy the ink box out of `png` into a new canvas of exactly that size. */
export function cropToInk(bytes, threshold = 24) {
  const png = PNG.sync.read(bytes);
  const box = inkBounds(png, threshold);
  if (!box) throw new Error('image is fully transparent: nothing to trim');
  const out = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(png, out, box.x, box.y, box.width, box.height, 0, 0);
  return {
    bytes: PNG.sync.write(out),
    from: { width: png.width, height: png.height },
    box,
  };
}

const args = process.argv.slice(2);
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && args.length) {
  const flag = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
  };
  const [input, output] = args.filter((value) => !value.startsWith('--') && !/^\d+$/.test(value));
  if (!input || !output) {
    console.error('usage: trim-icon-margin.mjs <in.png> <out.png> [--alpha 24]');
    process.exit(2);
  }
  const result = cropToInk(readFileSync(input), Number(flag('alpha', 24)));
  writeFileSync(output, result.bytes);
  const fill = Math.max(result.box.width, result.box.height)
    / Math.max(result.from.width, result.from.height);
  console.log(JSON.stringify({
    input,
    output,
    canvas: `${result.from.width}x${result.from.height}`,
    ink: `${result.box.width}x${result.box.height}`,
    inkFillBefore: Number(fill.toFixed(4)),
    droppedMargin: {
      left: result.box.x,
      top: result.box.y,
      right: result.from.width - (result.box.x + result.box.width),
      bottom: result.from.height - (result.box.y + result.box.height),
    },
  }, null, 2));
}
