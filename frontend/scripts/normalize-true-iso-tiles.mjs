import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const tileRoot = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles');
const outDir = path.join(tileRoot, 'canonical-true-iso');

const WIDTH = 96;
const HEIGHT = 140;
const LEGACY_TOP_HEIGHT = 54;
const TRUE_EDGE_DEGREES = 30;
const TOP_HEIGHT = WIDTH * Math.tan((TRUE_EDGE_DEGREES * Math.PI) / 180);
const LEGACY_STEP_Y = LEGACY_TOP_HEIGHT / 2;
const STEP_Y = TOP_HEIGHT / 2;

const legacy = {
  top: [
    [48, 0],
    [96, LEGACY_STEP_Y],
    [48, LEGACY_TOP_HEIGHT],
    [0, LEGACY_STEP_Y],
  ],
  left: [
    [0, LEGACY_STEP_Y],
    [48, LEGACY_TOP_HEIGHT],
    [48, HEIGHT],
    [0, HEIGHT - LEGACY_STEP_Y],
  ],
  right: [
    [96, LEGACY_STEP_Y],
    [48, LEGACY_TOP_HEIGHT],
    [48, HEIGHT],
    [96, HEIGHT - LEGACY_STEP_Y],
  ],
};

const trueIso = {
  top: [
    [48, 0],
    [96, STEP_Y],
    [48, TOP_HEIGHT],
    [0, STEP_Y],
  ],
  left: [
    [0, STEP_Y],
    [48, TOP_HEIGHT],
    [48, HEIGHT],
    [0, HEIGHT - STEP_Y],
  ],
  right: [
    [96, STEP_Y],
    [48, TOP_HEIGHT],
    [48, HEIGHT],
    [96, HEIGHT - STEP_Y],
  ],
};

const sourceSets = [
  {
    dir: 'canonical-clean',
    files: [
      'grass-clean-a.png',
      'grass-clean-b.png',
      'grass-clean-c.png',
      'stone-clean-a.png',
      'stone-clean-b.png',
      'water-clean-a.png',
      'water-clean-b.png',
      'transition-grass-stone-a.png',
      'transition-grass-stone-b.png',
      'transition-grass-water-a.png',
      'transition-grass-water-b.png',
    ],
  },
  {
    dir: 'canonical-refresh',
    files: [
      'grass-refresh-a.png',
      'grass-refresh-b.png',
      'grass-refresh-c.png',
      'stone-refresh-a.png',
      'stone-refresh-b.png',
      'water-refresh-a.png',
      'water-refresh-b.png',
    ],
  },
  {
    dir: 'canonical-template',
    files: ['guide-grass-tile.png', 'guide-stone-tile.png', 'guide-water-tile.png'],
  },
  {
    dir: 'canonical-transition-fill',
    files: fs.existsSync(path.join(tileRoot, 'canonical-transition-fill'))
      ? fs.readdirSync(path.join(tileRoot, 'canonical-transition-fill')).filter((file) => file.endsWith('.png'))
      : [],
  },
];

const transitionAliases = [
  ['transition-grass-stone-a.png', 'transition-grass-stone-0001.png'],
  ['transition-grass-stone-b.png', 'transition-grass-stone-0011.png'],
  ['transition-grass-water-a.png', 'transition-grass-water-0001.png'],
  ['transition-grass-water-b.png', 'transition-grass-water-0011.png'],
];

function makePng() {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data.fill(0);
  return png;
}

function pixelIndex(png, x, y) {
  return (y * png.width + x) * 4;
}

function getPixel(png, x, y) {
  const clampedX = Math.max(0, Math.min(png.width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(png.height - 1, Math.round(y)));
  const i = pixelIndex(png, clampedX, clampedY);
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = pixelIndex(png, x, y);
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function drawLine(png, x0, y0, x1, y1, color) {
  const startX = Math.round(x0);
  const startY = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - startX);
  const sx = startX < endX ? 1 : -1;
  const dy = -Math.abs(endY - startY);
  const sy = startY < endY ? 1 : -1;
  let err = dx + dy;
  let x = startX;
  let y = startY;
  while (true) {
    setPixel(png, x, y, color);
    if (x === endX && y === endY) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawPolygonOutline(png, polygon, color) {
  for (let i = 0; i < polygon.length; i += 1) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    drawLine(png, x0, y0, x1, y1, color);
  }
}

function regionFor(x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  if (insidePolygon(px, py, trueIso.top)) return 'top';
  if (insidePolygon(px, py, trueIso.left)) return 'left';
  if (insidePolygon(px, py, trueIso.right)) return 'right';
  return null;
}

function mapY(y, fromStart, fromEnd, toStart, toEnd) {
  const t = (y - fromStart) / (fromEnd - fromStart);
  return toStart + t * (toEnd - toStart);
}

function sourcePoint(x, y, region) {
  if (region === 'top') {
    return [x, mapY(y, 0, TOP_HEIGHT, 0, LEGACY_TOP_HEIGHT)];
  }
  if (region === 'left' || region === 'right') {
    return [x, mapY(y, STEP_Y, HEIGHT, LEGACY_STEP_Y, HEIGHT)];
  }
  return [x, y];
}

function normalizePng(source) {
  const output = makePng();
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const region = regionFor(x, y);
      if (!region) continue;
      const [sx, sy] = sourcePoint(x, y, region);
      const rgba = getPixel(source, sx, sy);
      if (rgba[3] > 0) setPixel(output, x, y, rgba);
    }
  }
  return output;
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function fillPolygon(png, polygon, rgba) {
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (insidePolygon(x + 0.5, y + 0.5, polygon)) setPixel(png, x, y, rgba);
    }
  }
}

function writeMasks() {
  const topMask = makePng();
  fillPolygon(topMask, trueIso.top, [255, 255, 255, 255]);
  writePng(path.join(outDir, 'top-mask.png'), topMask);

  const fullMask = makePng();
  fillPolygon(fullMask, trueIso.left, [180, 180, 180, 255]);
  fillPolygon(fullMask, trueIso.right, [180, 180, 180, 255]);
  fillPolygon(fullMask, trueIso.top, [255, 255, 255, 255]);
  writePng(path.join(outDir, 'full-tile-mask.png'), fullMask);
}

function writeProofSheet(records) {
  const rows = records.length;
  const gap = 12;
  const labelHeight = 14;
  const sheet = new PNG({ width: WIDTH * 2 + gap, height: rows * (HEIGHT + labelHeight + gap) });
  sheet.data.fill(0);
  for (let i = 0; i < records.length; i += 1) {
    const { before, after } = records[i];
    const yOffset = i * (HEIGHT + labelHeight + gap);
    blit(sheet, before, 0, yOffset);
    blit(sheet, after, WIDTH + gap, yOffset);
  }
  writePng(path.join(outDir, 'true-iso-before-after-proof.png'), sheet);
}

function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const si = pixelIndex(source, x, y);
      const alpha = source.data[si + 3];
      if (alpha === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const ti = pixelIndex(target, tx, ty);
      target.data[ti] = source.data[si];
      target.data[ti + 1] = source.data[si + 1];
      target.data[ti + 2] = source.data[si + 2];
      target.data[ti + 3] = alpha;
    }
  }
}

function run() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  writeMasks();

  const records = [];
  let written = 0;
  for (const sourceSet of sourceSets) {
    for (const file of sourceSet.files) {
      const inputPath = path.join(tileRoot, sourceSet.dir, file);
      if (!fs.existsSync(inputPath)) continue;
      const source = PNG.sync.read(fs.readFileSync(inputPath));
      if (source.width !== WIDTH || source.height !== HEIGHT) {
        throw new Error(`${sourceSet.dir}/${file} is ${source.width}x${source.height}, expected ${WIDTH}x${HEIGHT}`);
      }
      const normalized = normalizePng(source);
      writePng(path.join(outDir, file), normalized);
      records.push({ before: source, after: normalized });
      written += 1;
    }
  }
  for (const [sourceName, aliasName] of transitionAliases) {
    const sourcePath = path.join(outDir, sourceName);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(outDir, aliasName));
      written += 1;
    }
  }
  writeProofSheet(records.slice(0, 24));
  console.log(`Normalized ${written} tiles into ${outDir}`);
  console.log(`trueIsoTop=${WIDTH}x${TOP_HEIGHT.toFixed(3)}, step=${(WIDTH / 2).toFixed(3)}x${STEP_Y.toFixed(3)}`);
}

run();
