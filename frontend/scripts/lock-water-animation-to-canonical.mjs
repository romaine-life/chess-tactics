import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const canonicalPath = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-clean', 'water-clean-a.png');
const sourceDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a-locked');
const staticPath = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a-locked-static.png');
const reportPath = path.join(repoRoot, 'docs', 'art', 'ai-runs', 'water-sprite-sheet-a', 'locked-report.json');

const topDiamond = [
  [48, 0],
  [96, 27],
  [48, 54],
  [0, 27],
];

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

function clonePng(source) {
  const png = new PNG({ width: source.width, height: source.height });
  source.data.copy(png.data);
  return png;
}

function isInsideTop(x, y) {
  return insidePolygon(x + 0.5, y + 0.5, topDiamond);
}

function readFrame(index) {
  return PNG.sync.read(fs.readFileSync(path.join(sourceDir, `frame-${String(index).padStart(2, '0')}.png`)));
}

function brightenTopColor(color) {
  const [r, g, b, a] = color;
  if (a < 12) return undefined;
  return [
    Math.min(255, Math.round(r * 0.92 + 8)),
    Math.min(255, Math.round(g * 0.96 + 6)),
    Math.min(255, Math.round(b * 1.02 + 4)),
    255,
  ];
}

function diffOutsideTop(a, b) {
  let changed = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      if (isInsideTop(x, y)) continue;
      const ai = pixelIndex(a, x, y);
      if (
        a.data[ai] !== b.data[ai] ||
        a.data[ai + 1] !== b.data[ai + 1] ||
        a.data[ai + 2] !== b.data[ai + 2] ||
        a.data[ai + 3] !== b.data[ai + 3]
      ) {
        changed += 1;
      }
    }
  }
  return changed;
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const canonical = PNG.sync.read(fs.readFileSync(canonicalPath));
const report = [];

for (let frame = 0; frame < 8; frame += 1) {
  const source = readFrame(frame);
  const output = clonePng(canonical);
  let topPixels = 0;
  let animatedPixels = 0;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      if (!isInsideTop(x, y)) continue;
      topPixels += 1;
      const color = brightenTopColor(getPixel(source, x, y));
      if (!color) continue;
      setPixel(output, x, y, color);
      animatedPixels += 1;
    }
  }

  const outPath = path.join(outDir, `frame-${String(frame).padStart(2, '0')}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(output));
  report.push({
    frame,
    topPixels,
    animatedPixels,
    changedOutsideTopFromCanonical: diffOutsideTop(output, canonical),
  });
}

fs.copyFileSync(path.join(outDir, 'frame-00.png'), staticPath);
fs.writeFileSync(reportPath, JSON.stringify({ sourceDir, outDir, canonicalPath, report }, null, 2));

console.log(`Generated locked water animation frames in ${outDir}`);
console.log(`Report: ${reportPath}`);
