import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-template');

const template = {
  width: 96,
  topHeight: 54,
  sideHeight: 86,
};

const canvas = {
  width: template.width,
  height: template.topHeight + template.sideHeight,
};

const points = {
  top: [
    [48, 0],
    [96, 27],
    [48, 54],
    [0, 27],
  ],
  left: [
    [0, 27],
    [48, 54],
    [48, 140],
    [0, 113],
  ],
  right: [
    [96, 27],
    [48, 54],
    [48, 140],
    [96, 113],
  ],
};

const colors = {
  transparent: [0, 0, 0, 0],
  topMask: [255, 255, 255, 255],
  sideMask: [180, 180, 180, 255],
  guideLine: [80, 220, 255, 255],
  guideShadow: [4, 10, 18, 255],
  grassTop: [82, 116, 37, 255],
  grassLight: [151, 172, 55, 255],
  stoneTop: [103, 111, 99, 255],
  waterTop: [8, 100, 136, 255],
  cliffLeft: [23, 64, 82, 255],
  cliffRight: [10, 40, 56, 255],
};

const args = process.argv.slice(2);
const inputArg = readArg('--input');
const outputArg = readArg('--output');
const materialArg = readArg('--material') ?? 'grass';

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function makePng() {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }
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
      if (insidePolygon(x + 0.5, y + 0.5, polygon)) {
        setPixel(png, x, y, typeof colorFn === 'function' ? colorFn(x, y) : colorFn);
      }
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

function writePng(name, png) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function sampleNearest(png, u, v) {
  const x = Math.max(0, Math.min(png.width - 1, Math.round(u * (png.width - 1))));
  const y = Math.max(0, Math.min(png.height - 1, Math.round(v * (png.height - 1))));
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function scaleColor(color, factor) {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] * factor))),
    Math.max(0, Math.min(255, Math.round(color[1] * factor))),
    Math.max(0, Math.min(255, Math.round(color[2] * factor))),
    color[3],
  ];
}

function createMasks() {
  const top = makePng();
  fillPolygon(top, points.top, colors.topMask);
  writePng('top-mask.png', top);

  const left = makePng();
  fillPolygon(left, points.left, colors.topMask);
  writePng('left-cliff-mask.png', left);

  const right = makePng();
  fillPolygon(right, points.right, colors.topMask);
  writePng('right-cliff-mask.png', right);

  const full = makePng();
  fillPolygon(full, points.left, colors.sideMask);
  fillPolygon(full, points.right, colors.sideMask);
  fillPolygon(full, points.top, colors.topMask);
  writePng('full-tile-mask.png', full);
}

function createGuide() {
  const guide = makePng();
  fillPolygon(guide, points.left, (x, y) => {
    const shade = Math.max(0, Math.min(1, (y - 27) / 113));
    return [Math.round(32 - shade * 20), Math.round(81 - shade * 42), Math.round(102 - shade * 50), 255];
  });
  fillPolygon(guide, points.right, (x, y) => {
    const shade = Math.max(0, Math.min(1, (y - 27) / 113));
    return [Math.round(16 - shade * 10), Math.round(58 - shade * 34), Math.round(78 - shade * 44), 255];
  });
  fillPolygon(guide, points.top, (x, y) => {
    const fleck = (x * 17 + y * 31) % 29 < 3;
    return fleck ? colors.grassLight : colors.grassTop;
  });
  drawPolygonOutline(guide, points.left, colors.guideShadow);
  drawPolygonOutline(guide, points.right, colors.guideShadow);
  drawPolygonOutline(guide, points.top, colors.guideLine);
  writePng('guide-grass-tile.png', guide);

  const stone = makePng();
  fillPolygon(stone, points.left, colors.cliffLeft);
  fillPolygon(stone, points.right, colors.cliffRight);
  fillPolygon(stone, points.top, (x, y) => ((x + y) % 19 < 2 ? [142, 150, 136, 255] : colors.stoneTop));
  drawPolygonOutline(stone, points.top, colors.guideLine);
  writePng('guide-stone-tile.png', stone);

  const water = makePng();
  fillPolygon(water, points.left, colors.cliffLeft);
  fillPolygon(water, points.right, colors.cliffRight);
  fillPolygon(water, points.top, (x, y) => ((x * 3 + y * 5) % 37 < 5 ? [75, 207, 239, 255] : colors.waterTop));
  drawPolygonOutline(water, points.top, colors.guideLine);
  writePng('guide-water-tile.png', water);
}

function normalizeTile(inputPath, outputPath, material) {
  const source = readPng(inputPath);
  const output = makePng();
  const sideBase = material === 'water' ? [8, 71, 101, 255] : [16, 55, 70, 255];

  fillPolygon(output, points.left, (x, y) => {
    const shade = 0.74 - Math.max(0, Math.min(1, (y - 27) / 113)) * 0.38;
    return scaleColor(sideBase, shade);
  });
  fillPolygon(output, points.right, (x, y) => {
    const shade = 0.62 - Math.max(0, Math.min(1, (y - 27) / 113)) * 0.34;
    return scaleColor(sideBase, shade);
  });
  fillPolygon(output, points.top, (x, y) => {
    const u = x / (canvas.width - 1);
    const v = y / (template.topHeight - 1);
    return sampleNearest(source, u, v);
  });
  drawPolygonOutline(output, points.left, colors.guideShadow);
  drawPolygonOutline(output, points.right, colors.guideShadow);
  drawPolygonOutline(output, points.top, colors.guideLine);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(output));
}

createMasks();
createGuide();

if (inputArg && outputArg) {
  normalizeTile(path.resolve(inputArg), path.resolve(outputArg), materialArg);
  console.log(`Normalized ${inputArg} -> ${outputArg}`);
}

const angle = Math.atan((template.topHeight / 2) / (template.width / 2)) * (180 / Math.PI);
console.log(`Generated canonical tile template in ${outDir}`);
console.log(`top=${template.width}x${template.topHeight}, sideHeight=${template.sideHeight}, edgeAngle=${angle.toFixed(2)}deg`);
