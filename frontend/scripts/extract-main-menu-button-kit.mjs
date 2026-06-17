import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'public/assets/ui/proofs/main-menu-button-asset-kit-proof-02.png');
const OUT_DIR = path.join(ROOT, 'public/assets/ui/main-menu/buttons-v2');

const MODES = [
  ['solo-skirmish', 'sword'],
  ['campaign-editor', 'crown'],
  ['level-editor', 'scroll'],
  ['lobbies', 'people'],
  ['settings', 'gear'],
];

const ROWS = {
  normal: { x: 35, y: [45, 192, 338, 484, 630], w: 636, h: 154, ox: 0, oy: 5 },
  active: { x: 668, y: [34, 183, 331, 481, 628], w: 590, h: 164, ox: 23, oy: 0 },
};

const FRAME = { w: 636, h: 164 };
const POINTER_CLEANUP_RECTS = {
  normal: [
    // Remove the small disconnected lower pointer below each badge.
    { x: 72, y: 145, w: 48, h: 19 },
  ],
  active: [
    // The pressed crop includes disconnected top and bottom pointers.
    { x: 96, y: 0, w: 64, h: 18 },
    { x: 96, y: 145, w: 64, h: 19 },
  ],
};

const BG_KEYS = [
  [23, 27, 30],
  [18, 21, 25],
  [17, 19, 24],
  [24, 25, 30],
  [20, 22, 26],
];

function readPNG(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { w: png.width, h: png.height, data: png.data };
}

function makeImage(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) };
}

function pixelIndex(img, x, y) {
  return (y * img.w + x) * 4;
}

function colorDist2(data, i, key) {
  const dr = data[i] - key[0];
  const dg = data[i + 1] - key[1];
  const db = data[i + 2] - key[2];
  return dr * dr + dg * dg + db * db;
}

function isBackgroundPixel(img, x, y, tolerance = 18) {
  const i = pixelIndex(img, x, y);
  const t2 = tolerance * tolerance;
  return BG_KEYS.some((key) => colorDist2(img.data, i, key) <= t2);
}

function crop(img, rect) {
  const out = makeImage(rect.w, rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x;
      const sy = rect.y + y;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const si = pixelIndex(img, sx, sy);
      const di = pixelIndex(out, x, y);
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function floodRemoveBackground(img) {
  const seen = new Uint8Array(img.w * img.h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
    const p = y * img.w + x;
    if (seen[p]) return;
    if (!isBackgroundPixel(img, x, y)) return;
    seen[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < img.w; x++) {
    push(x, 0);
    push(x, img.h - 1);
  }
  for (let y = 0; y < img.h; y++) {
    push(0, y);
    push(img.w - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % img.w;
    const y = (p - x) / img.w;
    const i = p * 4;
    img.data[i + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function trimTransparent(img, padding = 4) {
  let minX = img.w;
  let minY = img.h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (img.data[pixelIndex(img, x, y) + 3] < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return img;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(img.w - 1, maxX + padding);
  const bottom = Math.min(img.h - 1, maxY + padding);
  return crop(img, { x, y, w: right - x + 1, h: bottom - y + 1 });
}

function composeFrame(row, ox, oy) {
  const out = makeImage(FRAME.w, FRAME.h);
  for (let y = 0; y < row.h; y++) {
    for (let x = 0; x < row.w; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= out.w || dy >= out.h) continue;
      const si = pixelIndex(row, x, y);
      const di = pixelIndex(out, dx, dy);
      out.data[di] = row.data[si];
      out.data[di + 1] = row.data[si + 1];
      out.data[di + 2] = row.data[si + 2];
      out.data[di + 3] = row.data[si + 3];
    }
  }
  return out;
}

function clearRect(img, rect) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(img.w, rect.x + rect.w);
  const y1 = Math.min(img.h, rect.y + rect.h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      img.data[pixelIndex(img, x, y) + 3] = 0;
    }
  }
}

function removePointerArtifacts(img, state) {
  for (const rect of POINTER_CLEANUP_RECTS[state] || []) clearRect(img, rect);
}

function stackStates(normal, active) {
  const out = makeImage(FRAME.w, FRAME.h * 2);
  for (let y = 0; y < normal.h; y++) {
    for (let x = 0; x < normal.w; x++) {
      const si = pixelIndex(normal, x, y);
      const di = pixelIndex(out, x, y);
      out.data[di] = normal.data[si];
      out.data[di + 1] = normal.data[si + 1];
      out.data[di + 2] = normal.data[si + 2];
      out.data[di + 3] = normal.data[si + 3];
    }
  }
  for (let y = 0; y < active.h; y++) {
    for (let x = 0; x < active.w; x++) {
      const si = pixelIndex(active, x, y);
      const di = pixelIndex(out, x, y + FRAME.h);
      out.data[di] = active.data[si];
      out.data[di + 1] = active.data[si + 1];
      out.data[di + 2] = active.data[si + 2];
      out.data[di + 3] = active.data[si + 3];
    }
  }
  return out;
}

function writePNG(img, filePath) {
  const png = new PNG({ width: img.w, height: img.h });
  img.data.copy(png.data);
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const source = readPNG(SOURCE);
  const manifest = {
    source: '/assets/ui/proofs/main-menu-button-asset-kit-proof-02.png',
    generatedBy: 'frontend/scripts/extract-main-menu-button-kit.mjs',
    modes: {},
  };

  for (const [index, [slug, badge]] of MODES.entries()) {
    manifest.modes[slug] = { badge, states: {} };
    const stateFrames = {};
    for (const state of ['normal', 'active']) {
      const spec = ROWS[state];
      const row = crop(source, { x: spec.x, y: spec.y[index], w: spec.w, h: spec.h });
      floodRemoveBackground(row);
      const framed = composeFrame(row, spec.ox, spec.oy);
      removePointerArtifacts(framed, state);
      stateFrames[state] = framed;
      const fileName = `${slug}-${state}.png`;
      writePNG(framed, path.join(OUT_DIR, fileName));
      manifest.modes[slug].states[state] = {
        image: `/assets/ui/main-menu/buttons-v2/${fileName}`,
        width: framed.w,
        height: framed.h,
      };
    }
    const sheetName = `${slug}-sheet.png`;
    writePNG(stackStates(stateFrames.normal, stateFrames.active), path.join(OUT_DIR, sheetName));
    manifest.modes[slug].sheet = {
      image: `/assets/ui/main-menu/buttons-v2/${sheetName}`,
      width: FRAME.w,
      height: FRAME.h * 2,
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Extracted ${MODES.length * 2} button row assets to ${path.relative(process.cwd(), OUT_DIR)}`);
}

main();
