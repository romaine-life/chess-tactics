import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-transition-fill');

const canvas = { width: 96, height: 140 };
const top = [[48, 0], [96, 27], [48, 54], [0, 27]];
const left = [[0, 27], [48, 54], [48, 140], [0, 113]];
const right = [[96, 27], [48, 54], [48, 140], [96, 113]];
const edges = ['north', 'east', 'south', 'west'];
const pairs = [
  { id: 'grass-stone', terrains: ['grass', 'stone'], existing: new Set([1, 3]) },
  { id: 'grass-water', terrains: ['grass', 'water'], existing: new Set([1, 3]) },
  { id: 'stone-water', terrains: ['stone', 'water'], existing: new Set() },
];

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

function materialColor(kind, x, y, seed) {
  const fine = hash(x, y, seed);
  if (kind === 'grass') {
    let color = mixColor([23, 50, 27, 255], [112, 135, 44, 255], 0.34 + hash(Math.floor(x / 9), Math.floor(y / 7), seed + 3) * 0.3);
    if (fine > 0.96) color = mixColor(color, [194, 184, 72, 255], 0.42);
    if (fine < 0.07) color = mixColor(color, [8, 24, 15, 255], 0.42);
    return color;
  }
  if (kind === 'stone') {
    const seam = ((x + y * 2) % 23 < 2 || (x * 2 - y) % 31 < 2) ? 1 : 0;
    let color = mixColor([52, 66, 66, 255], [139, 138, 118, 255], 0.3 + hash(Math.floor(x / 14), Math.floor(y / 11), seed + 7) * 0.38);
    if (seam) color = mixColor(color, [20, 27, 31, 255], 0.36);
    if (fine > 0.96) color = mixColor(color, [172, 169, 145, 255], 0.28);
    return color;
  }
  const flow = (x * 3 + y * 9 + Math.floor(hash(Math.floor(x / 9), Math.floor(y / 7), seed + 11) * 19)) % 31;
  let color = mixColor([3, 51, 96, 255], [8, 139, 176, 255], 0.28 + hash(Math.floor(x / 8), Math.floor(y / 7), seed + 13) * 0.42);
  if (flow < 4) color = mixColor(color, [97, 224, 239, 255], 0.38);
  if (flow > 27) color = mixColor(color, [1, 25, 58, 255], 0.28);
  return color;
}

function cliffColor(x, y, side, seed, kind) {
  const depth = Math.max(0, Math.min(1, (y - 27) / 113));
  const base = {
    grass: side === 'left' ? [23, 60, 72, 255] : [8, 34, 53, 255],
    stone: side === 'left' ? [36, 70, 82, 255] : [17, 45, 63, 255],
    water: side === 'left' ? [8, 79, 112, 255] : [4, 53, 85, 255],
  }[kind];
  const strata = Math.floor((y + hash(Math.floor(x / 8), 0, seed) * 10) / 9);
  const crack = hash(Math.floor(x / 6), strata, seed + (side === 'left' ? 31 : 71));
  let color = darken(base, 1 - depth * 0.62);
  if (crack > 0.76) color = mixColor(color, [93, 114, 112, 255], 0.22);
  if (crack < 0.13) color = mixColor(color, [1, 8, 16, 255], 0.42);
  return color;
}

function edgeFamily(mask, pair, edgeIndex) {
  return (mask & (1 << edgeIndex)) !== 0 ? pair.terrains[0] : pair.terrains[1];
}

function edgeWeights(x, y) {
  return {
    north: Math.max(0, 54 - y),
    east: Math.max(0, x - 48 + y * 0.35),
    south: Math.max(0, y),
    west: Math.max(0, 48 - x + y * 0.35),
  };
}

function familyAtPixel(x, y, mask, pair, seed) {
  const families = Object.fromEntries(edges.map((edge, index) => [edge, edgeFamily(mask, pair, index)]));
  const weights = edgeWeights(x, y);
  const jitter = (hash(Math.floor(x / 6), Math.floor(y / 5), seed) - 0.5) * 18;
  let bestEdge = 'north';
  let bestScore = -Infinity;
  for (const edge of edges) {
    const score = weights[edge] + jitter * (families[edge] === pair.terrains[0] ? 1 : -1);
    if (score > bestScore) {
      bestEdge = edge;
      bestScore = score;
    }
  }
  return families[bestEdge];
}

function boundaryTint(a, b, x, y, seed) {
  if (a === b) return a;
  if (a === 'grass' && b === 'water') return hash(x, y, seed) > 0.62 ? 'water' : 'grass';
  if (a === 'grass' && b === 'stone') return hash(x, y, seed) > 0.55 ? 'stone' : 'grass';
  if (a === 'stone' && b === 'water') return hash(x, y, seed) > 0.5 ? 'water' : 'stone';
  return a;
}

function topColor(x, y, mask, pair, seed) {
  const family = familyAtPixel(x, y, mask, pair, seed);
  const neighbor = familyAtPixel(Math.max(0, Math.min(95, x + 4)), Math.max(0, Math.min(53, y + 3)), mask, pair, seed + 5);
  const kind = boundaryTint(family, neighbor, x, y, seed + 17);
  let color = materialColor(kind, x, y, seed);
  if (family !== neighbor) color = mixColor(color, materialColor(neighbor, x, y, seed + 23), 0.28);
  return color;
}

function dominantSideKind(mask, pair, side) {
  const leftEdges = side === 'left' ? [2, 3] : [1, 2];
  const counts = new Map();
  for (const edgeIndex of leftEdges) {
    const family = edgeFamily(mask, pair, edgeIndex);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? pair.terrains[0];
}

function createTransition(pair, mask) {
  const seed = 8100 + pairs.findIndex((item) => item.id === pair.id) * 1000 + mask * 37;
  const png = makePng();
  fillPolygon(png, left, (x, y) => cliffColor(x, y, 'left', seed, dominantSideKind(mask, pair, 'left')));
  fillPolygon(png, right, (x, y) => cliffColor(x, y, 'right', seed, dominantSideKind(mask, pair, 'right')));
  fillPolygon(png, top, (x, y) => topColor(x, y, mask, pair, seed));
  drawPolygonOutline(png, left, [1, 8, 14, 255]);
  drawPolygonOutline(png, right, [1, 8, 14, 255]);
  drawPolygonOutline(png, top, [10, 31, 30, 255]);
  const code = mask.toString(2).padStart(4, '0');
  fs.writeFileSync(path.join(outDir, `transition-${pair.id}-${code}.png`), PNG.sync.write(png));
}

fs.mkdirSync(outDir, { recursive: true });
let generated = 0;
for (const pair of pairs) {
  for (let mask = 1; mask <= 14; mask += 1) {
    if (pair.existing.has(mask)) continue;
    createTransition(pair, mask);
    generated += 1;
  }
}

console.log(`Generated ${generated} transition fill tiles in ${outDir}`);
