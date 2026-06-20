import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-refresh');

const canvas = { width: 96, height: 140 };
const top = [[48, 0], [96, 27], [48, 54], [0, 27]];
const left = [[0, 27], [48, 54], [48, 140], [0, 113]];
const right = [[96, 27], [48, 54], [48, 140], [96, 113]];

function makePng() {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  png.data.fill(0);
  return png;
}

function setPixel(png, x, y, rgba) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (y * png.width + x) * 4;
  png.data[index] = rgba[0];
  png.data[index + 1] = rgba[1];
  png.data[index + 2] = rgba[2];
  png.data[index + 3] = rgba[3];
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
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
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
  for (let i = 0; i < polygon.length; i += 1) {
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

function cliffColor(x, y, side, seed, material = 'earth') {
  const depth = Math.max(0, Math.min(1, (y - 27) / 113));
  const strata = Math.floor((y + hash(Math.floor(x / 8), 0, seed) * 10) / 9);
  const vertical = Math.floor(x / 6);
  const crack = hash(vertical, strata, seed + (side === 'left' ? 31 : 71));
  const palette = {
    earth: side === 'left' ? [23, 60, 72, 255] : [8, 34, 53, 255],
    stone: side === 'left' ? [36, 70, 82, 255] : [17, 45, 63, 255],
    water: side === 'left' ? [8, 79, 112, 255] : [4, 53, 85, 255],
  }[material];
  let color = darken(palette, 1 - depth * 0.62);
  if (crack > 0.76) color = mixColor(color, [93, 114, 112, 255], 0.24);
  if (crack < 0.13) color = mixColor(color, [1, 8, 16, 255], 0.42);
  if (strata % 4 === 0 && crack > 0.42) color = mixColor(color, [52, 87, 91, 255], 0.18);
  return color;
}

function grassTopColor(x, y, seed) {
  const northLight = 1 - y / 54;
  const moss = hash(Math.floor((x + y) / 10), Math.floor((y - x) / 8), seed + 11);
  const fine = hash(x, y, seed + 19);
  let color = mixColor([22, 45, 25, 255], [118, 137, 44, 255], 0.24 + northLight * 0.25 + moss * 0.26);
  if (fine > 0.965) color = mixColor(color, [197, 187, 75, 255], 0.48);
  if (fine < 0.06) color = mixColor(color, [10, 25, 17, 255], 0.44);
  return color;
}

function stoneTopColor(x, y, seed) {
  const slabX = Math.floor((x + y * 0.8) / 17);
  const slabY = Math.floor((y - x * 0.35) / 12);
  const broad = hash(slabX, slabY, seed + 29);
  const seam = ((x + y * 2) % 25 < 2 || (x * 2 - y) % 34 < 2) ? 1 : 0;
  const fine = hash(x, y, seed + 41);
  let color = mixColor([54, 68, 68, 255], [142, 140, 119, 255], 0.28 + broad * 0.43);
  if (seam) color = mixColor(color, [20, 27, 31, 255], 0.42);
  if (fine > 0.955) color = mixColor(color, [176, 174, 148, 255], 0.32);
  if (fine < 0.075) color = mixColor(color, [28, 38, 40, 255], 0.42);
  return color;
}

function waterTopColor(x, y, seed) {
  const flow = (x * 3 + y * 9 + Math.floor(hash(Math.floor(x / 11), Math.floor(y / 8), seed) * 17)) % 31;
  const depth = hash(Math.floor(x / 9), Math.floor(y / 7), seed + 53);
  let color = mixColor([3, 53, 98, 255], [8, 144, 178, 255], 0.22 + depth * 0.46);
  if (flow < 4) color = mixColor(color, [96, 223, 240, 255], 0.38);
  if (flow > 27) color = mixColor(color, [1, 25, 58, 255], 0.28);
  return color;
}

function scatterDetails(png, seed, kind) {
  const count = kind === 'grass' ? 92 : kind === 'stone' ? 34 : 22;
  for (let i = 0; i < count; i += 1) {
    const x = 7 + Math.floor(hash(i, 101, seed) * 82);
    const y = 7 + Math.floor(hash(i, 103, seed) * 39);
    if (!insidePolygon(x + 0.5, y + 0.5, top)) continue;
    if (kind === 'grass') {
      const tone = hash(i, 107, seed);
      const color = tone > 0.86 ? [186, 179, 69, 255] : tone < 0.18 ? [17, 35, 20, 255] : [94, 126, 45, 255];
      setPixel(png, x, y, color);
      if (tone > 0.55 && insidePolygon(x + 1.5, y + 0.5, top)) setPixel(png, x + 1, y, darken(color, 0.78));
    } else if (kind === 'stone') {
      const len = 2 + Math.floor(hash(i, 109, seed) * 7);
      for (let j = 0; j < len; j += 1) {
        const px = x + j;
        const py = y + Math.floor(j / 3);
        if (insidePolygon(px + 0.5, py + 0.5, top)) setPixel(png, px, py, [30, 38, 40, 255]);
      }
    } else {
      const len = 3 + Math.floor(hash(i, 111, seed) * 8);
      for (let j = 0; j < len; j += 1) {
        const px = x + j;
        const py = y + Math.round(Math.sin(j / 2) * 1.2);
        if (insidePolygon(px + 0.5, py + 0.5, top)) setPixel(png, px, py, [99, 221, 238, 255]);
      }
    }
  }
}

function createTile(name, seed, kind, topColorFn) {
  const png = makePng();
  const sideKind = kind === 'water' ? 'water' : kind === 'stone' ? 'stone' : 'earth';
  fillPolygon(png, left, (x, y) => cliffColor(x, y, 'left', seed + 300, sideKind));
  fillPolygon(png, right, (x, y) => cliffColor(x, y, 'right', seed + 300, sideKind));
  fillPolygon(png, top, (x, y) => topColorFn(x, y, seed));
  scatterDetails(png, seed, kind);
  drawPolygonOutline(png, left, [1, 8, 14, 255]);
  drawPolygonOutline(png, right, [1, 8, 14, 255]);
  drawPolygonOutline(png, top, kind === 'water' ? [8, 59, 80, 255] : kind === 'stone' ? [24, 31, 31, 255] : [13, 31, 18, 255]);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

fs.mkdirSync(outDir, { recursive: true });
createTile('grass-refresh-a.png', 5101, 'grass', grassTopColor);
createTile('grass-refresh-b.png', 5107, 'grass', grassTopColor);
createTile('grass-refresh-c.png', 5113, 'grass', grassTopColor);
createTile('stone-refresh-a.png', 6101, 'stone', stoneTopColor);
createTile('stone-refresh-b.png', 6107, 'stone', stoneTopColor);
createTile('water-refresh-a.png', 7101, 'water', waterTopColor);
createTile('water-refresh-b.png', 7107, 'water', waterTopColor);

console.log(`Generated base refresh tiles in ${outDir}`);
