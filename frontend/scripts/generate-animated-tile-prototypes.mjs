import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const sourcePath = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-clean', 'water-clean-a.png');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'water-shimmer-a');

const top = [
  [48, 0],
  [96, 27],
  [48, 54],
  [0, 27],
];

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function hash(x, y, seed) {
  let n = x * 374761393 + y * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function pixelIndex(png, x, y) {
  return (y * png.width + x) * 4;
}

function getPixel(png, x, y) {
  const i = pixelIndex(png, x, y);
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function setPixel(png, x, y, color) {
  const i = pixelIndex(png, x, y);
  png.data[i] = color[0];
  png.data[i + 1] = color[1];
  png.data[i + 2] = color[2];
  png.data[i + 3] = color[3];
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t), a[3]];
}

function clonePng(source) {
  const png = new PNG({ width: source.width, height: source.height });
  source.data.copy(png.data);
  return png;
}

function topRowBounds(y) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let x = 0; x < 96; x += 1) {
    if (!insidePolygon(x + 0.5, y + 0.5, top)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  return Number.isFinite(minX) ? { minX, maxX } : undefined;
}

const topBoundsByRow = Array.from({ length: 54 }, (_, y) => topRowBounds(y));

function frameColor(source, x, y, frame) {
  const base = getPixel(source, x, y);
  const rowBounds = topBoundsByRow[y];
  const edgeInset = rowBounds ? Math.min(x - rowBounds.minX, rowBounds.maxX - x) : 0;
  const interior = edgeInset > 4 && y > 5 && y < 49;
  const flowA = (x * 2 + y * 5 - frame * 9 + 160) % 43;
  const flowB = (x * 5 - y * 3 - frame * 13 + 240) % 47;
  const longRipple = (x * 3 + y * 2 - frame * 14 + 320) % 86;
  const shortRipple = (x * 5 - y + frame * 11 + 220) % 68;
  const sparkle = hash(Math.floor((x + frame * 7) / 5), Math.floor((y - frame * 2) / 4), 9001);
  let color = base;

  if (flowA < 5 || flowB < 4) color = mixColor(color, [98, 223, 241, 255], 0.28);
  if (flowA > 36) color = mixColor(color, [0, 32, 75, 255], 0.18);

  if (interior && longRipple < 3) color = mixColor(color, [178, 250, 255, 255], 0.58);
  else if (interior && longRipple < 7) color = mixColor(color, [105, 227, 246, 255], 0.36);
  else if (interior && longRipple > 77) color = mixColor(color, [0, 29, 77, 255], 0.2);

  if (interior && shortRipple < 2) color = mixColor(color, [156, 244, 252, 255], 0.42);
  if (interior && sparkle > 0.965) color = mixColor(color, [202, 255, 255, 255], 0.48);
  return color;
}

function generateFrame(source, frame) {
  const png = clonePng(source);
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (!insidePolygon(x + 0.5, y + 0.5, top)) continue;
      setPixel(png, x, y, frameColor(source, x, y, frame));
    }
  }
  return png;
}

fs.mkdirSync(outDir, { recursive: true });
const source = PNG.sync.read(fs.readFileSync(sourcePath));

for (let frame = 0; frame < 8; frame += 1) {
  const png = generateFrame(source, frame);
  fs.writeFileSync(path.join(outDir, `frame-${String(frame).padStart(2, '0')}.png`), PNG.sync.write(png));
}

console.log(`Generated animated water prototype frames in ${outDir}`);
