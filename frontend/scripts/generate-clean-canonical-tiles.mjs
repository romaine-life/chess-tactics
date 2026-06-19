import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-clean');

const canvas = { width: 96, height: 140 };
const top = [
  [48, 0],
  [96, 27],
  [48, 54],
  [0, 27],
];
const left = [
  [0, 27],
  [48, 54],
  [48, 140],
  [0, 113],
];
const right = [
  [96, 27],
  [48, 54],
  [48, 140],
  [96, 113],
];

function makePng() {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  png.data.fill(0);
  return png;
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
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

function fillPolygon(png, polygon, colorFn) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (insidePolygon(x + 0.5, y + 0.5, polygon)) setPixel(png, x, y, colorFn(x, y));
    }
  }
}

function drawLine(png, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    setPixel(png, x, y, color);
    if (x === x1 && y === y1) break;
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
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    drawLine(png, x0, y0, x1, y1, color);
  }
}

function hash(x, y, seed) {
  let n = x * 374761393 + y * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t), 255];
}

function darken(color, t) {
  return [Math.round(color[0] * t), Math.round(color[1] * t), Math.round(color[2] * t), color[3]];
}

function grassTopColor(x, y, seed) {
  const northLight = 1 - y / 54;
  const broad = hash(Math.floor(x / 14), Math.floor(y / 9), seed + 101);
  const noise = hash(Math.floor(x / 3), Math.floor(y / 3), seed);
  const fine = hash(x, y, seed + 19);
  const pathShade = Math.abs(x - 48) / 48;
  const base = mixColor(
    [34, 58, 26, 255],
    [103, 132, 42, 255],
    0.32 + northLight * 0.24 + broad * 0.2 + (noise - 0.5) * 0.18 - (1 - pathShade) * 0.04,
  );
  if (fine > 0.955) return mixColor(base, [188, 181, 70, 255], 0.42);
  if (fine < 0.075) return mixColor(base, [18, 32, 19, 255], 0.38);
  return base;
}

function cliffColor(x, y, side, seed) {
  const depth = Math.max(0, Math.min(1, (y - 27) / 113));
  const vertical = Math.floor(x / 7);
  const crack = hash(vertical, Math.floor(y / 5), seed + (side === 'left' ? 31 : 71));
  const base = side === 'left' ? [24, 57, 73, 255] : [11, 38, 55, 255];
  let color = darken(base, 0.95 - depth * 0.58);
  if (crack > 0.78) color = mixColor(color, [76, 91, 92, 255], 0.3);
  if (crack < 0.14) color = mixColor(color, [4, 12, 18, 255], 0.38);
  return color;
}

function addGrassDetails(png, seed) {
  for (let i = 0; i < 74; i++) {
    const x = 8 + Math.floor(hash(i, 2, seed) * 80);
    const y = 8 + Math.floor(hash(i, 7, seed) * 38);
    if (!insidePolygon(x + 0.5, y + 0.5, top)) continue;
    const tone = hash(i, 11, seed);
    const color = tone > 0.86 ? [175, 172, 69, 255] : tone < 0.2 ? [21, 39, 21, 255] : [111, 139, 47, 255];
    setPixel(png, x, y, color);
    if (hash(i, 13, seed) > 0.55) setPixel(png, x + 1, y, darken(color, 0.76));
  }
  for (let i = 0; i < 10; i++) {
    const cx = 12 + Math.floor(hash(i, 23, seed) * 72);
    const cy = 13 + Math.floor(hash(i, 29, seed) * 28);
    const color = hash(i, 31, seed) > 0.5 ? [66, 88, 36, 255] : [103, 117, 46, 255];
    for (let dx = -2; dx <= 2; dx++) {
      const dy = Math.abs(dx) === 2 ? 0 : 1;
      if (insidePolygon(cx + dx + 0.5, cy + dy + 0.5, top)) setPixel(png, cx + dx, cy + dy, color);
    }
  }
  for (let i = 0; i < 8; i++) {
    const cx = 10 + Math.floor(hash(i, 53, seed) * 76);
    const cy = 12 + Math.floor(hash(i, 59, seed) * 31);
    if (!insidePolygon(cx + 0.5, cy + 0.5, top)) continue;
    const flower = hash(i, 61, seed) > 0.65 ? [198, 188, 91, 255] : [137, 157, 68, 255];
    setPixel(png, cx, cy, flower);
    if (insidePolygon(cx + 1.5, cy + 0.5, top)) setPixel(png, cx + 1, cy, darken(flower, 0.72));
  }
}

function createGrassTile(name, seed) {
  const png = makePng();
  fillPolygon(png, left, (x, y) => cliffColor(x, y, 'left', seed));
  fillPolygon(png, right, (x, y) => cliffColor(x, y, 'right', seed));
  fillPolygon(png, top, (x, y) => grassTopColor(x, y, seed));
  addGrassDetails(png, seed);
  drawPolygonOutline(png, left, [2, 8, 13, 255]);
  drawPolygonOutline(png, right, [2, 8, 13, 255]);
  drawPolygonOutline(png, top, [16, 31, 17, 255]);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

function stoneTopColor(x, y, seed) {
  const broad = hash(Math.floor(x / 14), Math.floor(y / 9), seed + 201);
  const fine = hash(x, y, seed + 211);
  let color = mixColor([64, 76, 75, 255], [130, 132, 116, 255], 0.34 + broad * 0.36);
  if ((x + y * 2) % 23 < 2 || (x * 2 - y) % 31 < 2) color = mixColor(color, [23, 30, 31, 255], 0.38);
  if (fine > 0.94) color = mixColor(color, [163, 168, 151, 255], 0.34);
  if (fine < 0.08) color = mixColor(color, [33, 45, 45, 255], 0.4);
  return color;
}

function addStoneDetails(png, seed) {
  for (let i = 0; i < 14; i++) {
    const x0 = 8 + Math.floor(hash(i, 3, seed) * 78);
    const y0 = 8 + Math.floor(hash(i, 5, seed) * 38);
    const len = 4 + Math.floor(hash(i, 7, seed) * 12);
    const slope = hash(i, 11, seed) > 0.5 ? 1 : -1;
    for (let j = 0; j < len; j++) {
      const x = x0 + j;
      const y = y0 + Math.floor((j * slope) / 3);
      if (insidePolygon(x + 0.5, y + 0.5, top)) setPixel(png, x, y, [34, 42, 42, 255]);
    }
  }
}

function createStoneTile(name, seed) {
  const png = makePng();
  fillPolygon(png, left, (x, y) => cliffColor(x, y, 'left', seed + 300));
  fillPolygon(png, right, (x, y) => cliffColor(x, y, 'right', seed + 300));
  fillPolygon(png, top, (x, y) => stoneTopColor(x, y, seed));
  addStoneDetails(png, seed);
  drawPolygonOutline(png, left, [2, 8, 13, 255]);
  drawPolygonOutline(png, right, [2, 8, 13, 255]);
  drawPolygonOutline(png, top, [25, 33, 32, 255]);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

function waterTopColor(x, y, seed) {
  const broad = hash(Math.floor(x / 16), Math.floor(y / 7), seed + 401);
  const ripple = (x * 3 + y * 7 + Math.floor(broad * 9)) % 29;
  let color = mixColor([4, 68, 103, 255], [8, 137, 171, 255], 0.26 + broad * 0.42);
  if (ripple < 3) color = mixColor(color, [93, 218, 242, 255], 0.36);
  if (ripple > 25) color = mixColor(color, [2, 35, 68, 255], 0.3);
  return color;
}

function addWaterDetails(png, seed) {
  for (let i = 0; i < 12; i++) {
    const x0 = 10 + Math.floor(hash(i, 41, seed) * 72);
    const y0 = 10 + Math.floor(hash(i, 43, seed) * 32);
    const len = 5 + Math.floor(hash(i, 47, seed) * 10);
    for (let j = 0; j < len; j++) {
      const x = x0 + j;
      const y = y0 + Math.floor(Math.sin(j / 2) * 1.5);
      if (insidePolygon(x + 0.5, y + 0.5, top)) setPixel(png, x, y, [92, 218, 240, 255]);
    }
  }
}

function createWaterTile(name, seed) {
  const png = makePng();
  fillPolygon(png, left, (x, y) => {
    const depth = Math.max(0, Math.min(1, (y - 27) / 113));
    return mixColor([9, 88, 120, 255], [2, 18, 34, 255], depth * 0.86);
  });
  fillPolygon(png, right, (x, y) => {
    const depth = Math.max(0, Math.min(1, (y - 27) / 113));
    return mixColor([5, 65, 94, 255], [2, 14, 28, 255], depth * 0.86);
  });
  fillPolygon(png, top, (x, y) => waterTopColor(x, y, seed));
  addWaterDetails(png, seed);
  drawPolygonOutline(png, left, [1, 8, 15, 255]);
  drawPolygonOutline(png, right, [1, 8, 15, 255]);
  drawPolygonOutline(png, top, [10, 57, 77, 255]);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

function createBlendTile(name, seed, fromColorFn, toColorFn, material) {
  const png = makePng();
  fillPolygon(png, left, (x, y) => cliffColor(x, y, 'left', seed + 500));
  fillPolygon(png, right, (x, y) => cliffColor(x, y, 'right', seed + 500));
  fillPolygon(png, top, (x, y) => {
    const diagonal = (x + y * 1.7) / 150;
    const broken = (hash(Math.floor(x / 6), Math.floor(y / 4), seed + 503) - 0.5) * 0.3;
    const t = Math.max(0, Math.min(1, diagonal + broken));
    const from = fromColorFn(x, y, seed + 509);
    const to = toColorFn(x, y, seed + 521);
    return mixColor(from, to, t);
  });
  if (material === 'grass-stone') {
    addGrassDetails(png, seed + 30);
    addStoneDetails(png, seed + 40);
  } else {
    addGrassDetails(png, seed + 50);
    addWaterDetails(png, seed + 60);
  }
  drawPolygonOutline(png, left, [2, 8, 13, 255]);
  drawPolygonOutline(png, right, [2, 8, 13, 255]);
  drawPolygonOutline(png, top, [16, 31, 22, 255]);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

fs.mkdirSync(outDir, { recursive: true });
createGrassTile('grass-clean-a.png', 1201);
createGrassTile('grass-clean-b.png', 1207);
createGrassTile('grass-clean-c.png', 1213);
createStoneTile('stone-clean-a.png', 2201);
createStoneTile('stone-clean-b.png', 2207);
createWaterTile('water-clean-a.png', 3201);
createWaterTile('water-clean-b.png', 3207);
createBlendTile('transition-grass-stone-a.png', 4201, grassTopColor, stoneTopColor, 'grass-stone');
createBlendTile('transition-grass-stone-b.png', 4207, grassTopColor, stoneTopColor, 'grass-stone');
createBlendTile('transition-grass-water-a.png', 4301, grassTopColor, waterTopColor, 'grass-water');
createBlendTile('transition-grass-water-b.png', 4307, grassTopColor, waterTopColor, 'grass-water');

console.log(`Generated clean canonical terrain tiles in ${outDir}`);
