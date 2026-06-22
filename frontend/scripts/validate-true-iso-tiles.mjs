import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const tileRoot = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles');
const targetDir = path.join(tileRoot, 'canonical-true-iso');

const WIDTH = 96;
const HEIGHT = 140;
const TOP_HEIGHT = WIDTH * Math.tan((30 * Math.PI) / 180);
const STEP_Y = TOP_HEIGHT / 2;
const ALPHA_TOLERANCE_PIXELS = 20;

const polygons = {
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

const requiredFiles = [
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
  'grass-refresh-a.png',
  'grass-refresh-b.png',
  'grass-refresh-c.png',
  'stone-refresh-a.png',
  'stone-refresh-b.png',
  'water-refresh-a.png',
  'water-refresh-b.png',
  'guide-grass-tile.png',
  'guide-stone-tile.png',
  'guide-water-tile.png',
  'top-mask.png',
  'full-tile-mask.png',
];

const transitionPairs = ['grass-stone', 'grass-water', 'stone-water'];
for (const pair of transitionPairs) {
  for (let mask = 1; mask <= 14; mask += 1) {
    const code = mask.toString(2).padStart(4, '0');
    requiredFiles.push(`transition-${pair}-${code}.png`);
  }
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

function legalPixel(x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  return insidePolygon(px, py, polygons.top) || insidePolygon(px, py, polygons.left) || insidePolygon(px, py, polygons.right);
}

function topPixel(x, y) {
  return insidePolygon(x + 0.5, y + 0.5, polygons.top);
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3];
}

function validateTile(file) {
  const filePath = path.join(targetDir, file);
  if (!fs.existsSync(filePath)) return [`missing ${file}`];
  const png = PNG.sync.read(fs.readFileSync(filePath));
  const errors = [];
  if (png.width !== WIDTH || png.height !== HEIGHT) {
    errors.push(`${file}: ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`);
    return errors;
  }

  let illegalOpaque = 0;
  let transparentTop = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = alphaAt(png, x, y);
      if (alpha > 0 && !legalPixel(x, y)) illegalOpaque += 1;
      if (alpha === 0 && topPixel(x, y) && !file.endsWith('mask.png')) transparentTop += 1;
    }
  }

  if (illegalOpaque > ALPHA_TOLERANCE_PIXELS) errors.push(`${file}: ${illegalOpaque} opaque pixels outside legal true-iso tile body`);
  if (transparentTop > ALPHA_TOLERANCE_PIXELS) errors.push(`${file}: ${transparentTop} transparent pixels inside top diamond`);
  return errors;
}

const errors = requiredFiles.flatMap(validateTile);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${requiredFiles.length} true-isometric tile assets in ${targetDir}`);
