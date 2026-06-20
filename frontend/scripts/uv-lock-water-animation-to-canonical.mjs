import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const canonicalPath = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-clean', 'water-clean-a.png');
const sourceDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a');
const outDir = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a-uv-locked');
const staticPath = path.join(repoRoot, 'frontend', 'public', 'assets', 'tiles', 'canonical-animated', 'ai-water-sheet-a-uv-locked-static.png');
const reportPath = path.join(repoRoot, 'docs', 'art', 'ai-runs', 'water-sprite-sheet-a', 'uv-locked-report.json');

const frameCount = 8;

const canonicalTop = {
  top: [48, 0],
  right: [96, 27],
  bottom: [48, 54],
  left: [0, 27],
};

// The normalized direct-AI frames have a taller top plane than the canonical tile.
// Treat this as the source UV patch and map it into the canonical top diamond.
const sourceTop = {
  top: [48, 1],
  right: [94, 36],
  bottom: [48, 70],
  left: [2, 36],
};

const triangleNames = ['top', 'right', 'bottom', 'left'];

function triangleMap(quad) {
  const center = [
    (quad.top[0] + quad.right[0] + quad.bottom[0] + quad.left[0]) / 4,
    (quad.top[1] + quad.right[1] + quad.bottom[1] + quad.left[1]) / 4,
  ];
  return {
    top: [quad.top, quad.right, center],
    right: [quad.right, quad.bottom, center],
    bottom: [quad.bottom, quad.left, center],
    left: [quad.left, quad.top, center],
  };
}

function barycentric(point, triangle) {
  const [p0, p1, p2] = triangle;
  const [x, y] = point;
  const denominator = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
  const a = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (y - p2[1])) / denominator;
  const b = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (y - p2[1])) / denominator;
  const c = 1 - a - b;
  return [a, b, c];
}

function pointInTriangle(point, triangle) {
  const [a, b, c] = barycentric(point, triangle);
  const epsilon = -0.0001;
  return a >= epsilon && b >= epsilon && c >= epsilon;
}

function interpolate(triangle, weights) {
  const [a, b, c] = weights;
  return [
    triangle[0][0] * a + triangle[1][0] * b + triangle[2][0] * c,
    triangle[0][1] * a + triangle[1][1] * b + triangle[2][1] * c,
  ];
}

function pixelIndex(png, x, y) {
  return (y * png.width + x) * 4;
}

function getPixel(png, x, y) {
  const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
  const i = pixelIndex(png, px, py);
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

function readFrame(index) {
  return PNG.sync.read(fs.readFileSync(path.join(sourceDir, `frame-${String(index).padStart(2, '0')}.png`)));
}

function enhanceWaterTop(color) {
  const [r, g, b, a] = color;
  if (a < 12) return undefined;
  return [
    Math.min(255, Math.round(r * 0.92 + 6)),
    Math.min(255, Math.round(g * 0.98 + 4)),
    Math.min(255, Math.round(b * 1.02 + 4)),
    255,
  ];
}

function changedOutsideCanonicalTop(a, canonical, canonicalTriangles) {
  let changed = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const point = [x + 0.5, y + 0.5];
      if (triangleNames.some((name) => pointInTriangle(point, canonicalTriangles[name]))) continue;
      const i = pixelIndex(a, x, y);
      if (
        a.data[i] !== canonical.data[i] ||
        a.data[i + 1] !== canonical.data[i + 1] ||
        a.data[i + 2] !== canonical.data[i + 2] ||
        a.data[i + 3] !== canonical.data[i + 3]
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
const canonicalTriangles = triangleMap(canonicalTop);
const sourceTriangles = triangleMap(sourceTop);
const report = [];

for (let frame = 0; frame < frameCount; frame += 1) {
  const source = readFrame(frame);
  const output = clonePng(canonical);
  let mappedPixels = 0;
  let skippedPixels = 0;

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const point = [x + 0.5, y + 0.5];
      const triangleName = triangleNames.find((name) => pointInTriangle(point, canonicalTriangles[name]));
      if (!triangleName) continue;

      const weights = barycentric(point, canonicalTriangles[triangleName]);
      const sourcePoint = interpolate(sourceTriangles[triangleName], weights);
      const color = enhanceWaterTop(getPixel(source, sourcePoint[0], sourcePoint[1]));
      if (!color) {
        skippedPixels += 1;
        continue;
      }

      setPixel(output, x, y, color);
      mappedPixels += 1;
    }
  }

  const outPath = path.join(outDir, `frame-${String(frame).padStart(2, '0')}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(output));
  report.push({
    frame,
    mappedPixels,
    skippedPixels,
    changedOutsideTopFromCanonical: changedOutsideCanonicalTop(output, canonical, canonicalTriangles),
  });
}

fs.copyFileSync(path.join(outDir, 'frame-00.png'), staticPath);
fs.writeFileSync(
  reportPath,
  JSON.stringify({ canonicalPath, sourceDir, outDir, canonicalTop, sourceTop, report }, null, 2),
);

console.log(`Generated UV-locked water animation frames in ${outDir}`);
console.log(`Report: ${reportPath}`);
