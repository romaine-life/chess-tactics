// Cut the approved Codex chrome family sheet into reusable kit atoms.
//
// Source sheet:
//   docs/art/chrome-junction-candidates/codex/complete-family-corners-junctions-long-rails-alpha.png
//
// The large outer band is currently the accepted source. Corners keep their gold
// socket ornament; mid-junctions use the natural atomless T/cross so rails read as
// one continuous forged piece.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const sourcePath = `${root}docs/art/chrome-junction-candidates/codex/complete-family-corners-junctions-long-rails-alpha.png`;
const atomsDir = `${root}frontend/public/assets/ui/kit/atoms/`;

function np(width, height) {
  const out = new PNG({ width, height });
  out.data.fill(0);
  return out;
}

function copyPx(src, sx, sy, dst, dx, dy) {
  const si = (sy * src.width + sx) * 4;
  const di = (dy * dst.width + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}

function crop(src, x0, y0, width, height) {
  const out = np(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      copyPx(src, x0 + x, y0 + y, out, x, y);
    }
  }
  return out;
}

function flipV(src) {
  const out = np(src.width, src.height);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      copyPx(src, x, src.height - 1 - y, out, x, y);
    }
  }
  return out;
}

function rotateCCW(src) {
  const out = np(src.height, src.width);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      copyPx(src, src.width - 1 - y, x, out, x, y);
    }
  }
  return out;
}

function write(name, png) {
  writeFileSync(`${atomsDir}${name}.png`, PNG.sync.write(png));
  console.log(`wrote atoms/${name}.png ${png.width}x${png.height}`);
}

mkdirSync(atomsDir, { recursive: true });
const sheet = PNG.sync.read(readFileSync(sourcePath));

// Large outer band component boxes from alpha segmentation:
// corner sample component: (26,117)-(292,429). The bottom-left corner has the
// clean rail arms; flip it vertically to make the canonical top-left atom.
write('codex-outer-corner', flipV(crop(sheet, 26, 299, 180, 130)));
write('codex-outer-edge', crop(sheet, 1303, 127, 360, 56));
write('codex-outer-fill', np(8, 8));

// Natural top-oriented T: (831,211)-(1026,429). Rotate CCW to get the side-oriented
// left cap (vertical rail on the left, branch flowing right), matching buildBarFromTee.
write('codex-outer-tee-natural', rotateCCW(crop(sheet, 831, 211, 195, 218)));
write('codex-outer-cross-natural', crop(sheet, 1051, 104, 236, 325));

