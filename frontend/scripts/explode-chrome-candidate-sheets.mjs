// Explode generated chrome candidate sheets into individual candidate files.
//
// Chrome Lab should tune concrete atom/rail assets, not moving crop windows over
// a sheet of unrelated candidates. This script is the repeatable bridge from a
// generated batch sheet to the per-file candidate catalog the app consumes.
import { PNG } from 'pngjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const publicOutDir = resolve(root, 'frontend/public/assets/ui/chrome-candidates/exploded');
const manifestPath = resolve(root, 'frontend/src/ui/chromeCandidateManifest.json');

const SHEETS = [
  { id: 'outer-atoms-v3', label: 'Outer atoms', role: 'outer', kind: 'atom', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v3/outer-atoms-alpha.png', minPixels: 140, pad: 4, manifest: false },
  { id: 'inner-atoms-v3', label: 'Inner atoms', role: 'inner', kind: 'atom', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v3/inner-atoms-alpha.png', minPixels: 80, pad: 3, manifest: false },
  { id: 'outer-rails-repeat-v4', label: 'Outer rails repeatable', role: 'outer', kind: 'rail-repeat', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v4/outer-rails-repeatable-alpha.png', minPixels: 260, pad: 2 },
  { id: 'outer-rails-long-v4', label: 'Outer rails long', role: 'outer', kind: 'rail-long', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v4/outer-rails-long-alpha.png', minPixels: 260, pad: 2 },
  { id: 'outer-rails-v3', label: 'Outer rails v3', role: 'outer', kind: 'rail-sheet', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v3/outer-rails-alpha.png', minPixels: 260, pad: 2 },
  { id: 'inner-rails-repeat-v4', label: 'Inner rails repeatable', role: 'inner', kind: 'rail-repeat', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v4/inner-rails-repeatable-alpha.png', minPixels: 160, pad: 2 },
  { id: 'inner-rails-long-v4', label: 'Inner rails long', role: 'inner', kind: 'rail-long', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v4/inner-rails-long-alpha.png', minPixels: 160, pad: 2 },
  { id: 'inner-rails-v3', label: 'Inner rails v3', role: 'inner', kind: 'rail-sheet', src: 'frontend/public/assets/ui/chrome-candidates/codex-independent-v3/inner-rails-alpha.png', minPixels: 160, pad: 2 },
  { id: 'outer-atoms-img2img-32-v1', label: 'Outer img2img atoms 32', role: 'outer', kind: 'atom', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v1/outer-atoms-32-sheet.png', minPixels: 5000, pad: 8, chromaKey: 'green', targetMax: 32, resizePolicy: 'legacy-downscale' },
  { id: 'inner-atoms-img2img-micro-v1', label: 'Inner img2img atoms micro', role: 'inner', kind: 'atom', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v1/inner-atoms-micro-sheet.png', minPixels: 3500, pad: 8, chromaKey: 'green', targetMax: 8, resizePolicy: 'legacy-downscale', manifest: false },
  { id: 'inner-atoms-img2img-micro-v2', label: 'Inner img2img atoms 5-target', role: 'inner', kind: 'atom', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v2/inner-atoms-5-target-sheet.png', minPixels: 900, pad: 8, chromaKey: 'green', targetMax: 5, resizePolicy: 'legacy-downscale' },
  { id: 'divider-atoms-img2img-t-v1', label: 'Divider img2img T atoms', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v1/divider-t-atoms-17-sheet.png', minPixels: 5000, pad: 8, chromaKey: 'green', targetMax: 17, resizePolicy: 'legacy-downscale', manifest: false },
  { id: 'divider-atoms-img2img-t-v2', label: 'Divider img2img T atoms 17-target', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v2/divider-t-atoms-17-target-sheet.png', minPixels: 1800, pad: 8, chromaKey: 'green', targetMax: 17, resizePolicy: 'legacy-downscale', manifest: false },
  { id: 'divider-atoms-img2img-socket-v1', label: 'Divider socket atoms 32-target', src: 'frontend/public/assets/ui/chrome-candidates/img2img-v2/divider-socket-atoms-32-target-sheet.png', minPixels: 5000, pad: 8, chromaKey: 'green', targetMax: 32, resizePolicy: 'legacy-downscale', manifest: false },
];

const DIRECT_SETS = [
  { id: 'divider-atoms-pixellab-cover-v1', label: 'Divider PixelLab cover atoms 17', srcDir: 'frontend/public/assets/ui/chrome-candidates/pixellab-v1/divider-cover-atoms-17', naturalSize: [17, 17], manifest: false },
  { id: 'divider-atoms-codex-style-cover-v1', label: 'Divider Codex-style cover atoms 17', srcDir: 'frontend/public/assets/ui/chrome-candidates/pixellab-v1/divider-cover-atoms-codex-style-17', naturalSize: [17, 17], manifest: false },
];

function np(width, height) {
  const out = new PNG({ width, height });
  out.data.fill(0);
  return out;
}

function crop(src, x0, y0, width, height) {
  const out = np(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function chromaKeyToAlpha(src, key) {
  if (key !== 'green') return src;
  const out = np(src.width, src.height);
  for (let i = 0; i < src.width * src.height; i += 1) {
    const si = i * 4;
    const r = src.data[si];
    const g = src.data[si + 1];
    const b = src.data[si + 2];
    const a = src.data[si + 3];
    const maxOther = Math.max(r, b);
    const greenDistance = g - maxOther;
    const keyed = g > 45 && greenDistance > 18 && g > maxOther * 1.18;
    out.data[si] = r;
    out.data[si + 1] = !keyed && greenDistance > 8 ? maxOther : g;
    out.data[si + 2] = b;
    out.data[si + 3] = keyed ? 0 : a;
  }
  return out;
}

function resizeToMax(src, targetMax) {
  if (!targetMax) return src;
  const srcMax = Math.max(src.width, src.height);
  if (srcMax <= targetMax) return src;
  const scale = targetMax / srcMax;
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const out = np(width, height);
  const xRatio = src.width / width;
  const yRatio = src.height / height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x + 0.5) * xRatio));
      const sy = Math.min(src.height - 1, Math.floor((y + 0.5) * yRatio));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function paddedCrop(minX, minY, maxX, maxY, pixels, size, pad) {
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(size.w, maxX + pad + 1);
  const bottom = Math.min(size.h, maxY + pad + 1);
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
    pixels,
    contentW: Math.max(1, maxX - minX + 1),
    contentH: Math.max(1, maxY - minY + 1),
  };
}

function detectAlphaComponents(src, minPixels, pad) {
  const width = src.width;
  const height = src.height;
  const seen = new Uint8Array(width * height);
  const components = [];
  const stack = [];
  const isSolid = (index) => src.data[index * 4 + 3] > 24;

  for (let start = 0; start < seen.length; start += 1) {
    if (seen[start] || !isSolid(start)) continue;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;
    stack.length = 0;
    seen[start] = 1;
    stack.push(start);

    while (stack.length) {
      const index = stack.pop();
      const x = index % width;
      const y = Math.floor(index / width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x > 0) {
        const next = index - 1;
        if (!seen[next] && isSolid(next)) { seen[next] = 1; stack.push(next); }
      }
      if (x + 1 < width) {
        const next = index + 1;
        if (!seen[next] && isSolid(next)) { seen[next] = 1; stack.push(next); }
      }
      if (y > 0) {
        const next = index - width;
        if (!seen[next] && isSolid(next)) { seen[next] = 1; stack.push(next); }
      }
      if (y + 1 < height) {
        const next = index + width;
        if (!seen[next] && isSolid(next)) { seen[next] = 1; stack.push(next); }
      }
    }

    if (pixels >= minPixels) components.push(paddedCrop(minX, minY, maxX, maxY, pixels, { w: width, h: height }, pad));
  }

  return components.sort((a, b) => a.y - b.y || a.x - b.x || b.pixels - a.pixels);
}

function railScore(component) {
  const longAxis = Math.max(component.w, component.h);
  const shortAxis = Math.min(component.w, component.h);
  return longAxis * 8 + component.pixels / 1000 + (component.w >= component.h ? 5000 : 0) - shortAxis;
}

function validateNaturalSize(sheet, components) {
  if (!sheet.naturalMaxRange) return;
  const [min, max] = sheet.naturalMaxRange;
  const failures = [];
  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    const naturalMax = Math.max(component.contentW, component.contentH);
    if (naturalMax < min || naturalMax > max) {
      failures.push(`${String(i + 1).padStart(2, '0')} is ${component.contentW}x${component.contentH}`);
    }
  }
  if (failures.length) {
    throw new Error(
      `${sheet.id}: natural component size must be within ${min}-${max}px before any resize; ` +
      `not writing downscaled candidates. Failed candidates: ${failures.join(', ')}`,
    );
  }
}

function writePng(path, png) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

function repoPath(path) {
  return resolve(root, path);
}

function validateResizePolicy(sheet) {
  if (!sheet.targetMax) return;
  if (sheet.resizePolicy === 'legacy-downscale') return;
  if (sheet.resizePolicy === 'strict-natural-range' && sheet.naturalMaxRange) return;
  throw new Error(`${sheet.id}: targetMax requires resizePolicy: 'strict-natural-range' with naturalMaxRange, or an explicit legacy-downscale exception`);
}

function pngSize(path) {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height };
}

if (existsSync(publicOutDir)) rmSync(publicOutDir, { recursive: true, force: true });
mkdirSync(publicOutDir, { recursive: true });

const sources = [];
for (const sheet of SHEETS) {
  validateResizePolicy(sheet);
  const sourcePath = repoPath(sheet.src);
  if (!existsSync(sourcePath)) throw new Error(`missing source sheet ${sourcePath}`);
  const src = chromaKeyToAlpha(PNG.sync.read(readFileSync(sourcePath)), sheet.chromaKey);
  const components = detectAlphaComponents(src, sheet.minPixels, sheet.pad);
  validateNaturalSize(sheet, components);
  const defaultIndex = sheet.kind === 'atom'
    ? 0
    : components.reduce((best, component, index) => (railScore(component) > railScore(components[best]) ? index : best), 0);

  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    const number = String(i + 1).padStart(2, '0');
    const id = `${sheet.id}-${number}`;
    const file = `${sheet.id}/candidate-${number}.png`;
    const outPath = resolve(publicOutDir, file);
    const candidate = resizeToMax(crop(src, component.x, component.y, component.w, component.h), sheet.targetMax);
    writePng(outPath, candidate);
    if (sheet.manifest === false) continue;
    sources.push({
      id,
      label: `${sheet.label} ${number}`,
      role: sheet.role,
      kind: sheet.kind,
      src: `/assets/ui/chrome-candidates/exploded/${file.replace(/\\/g, '/')}`,
      width: candidate.width,
      height: candidate.height,
      sourceSheetId: sheet.id,
      sourceSheetLabel: sheet.label,
      sourceSheetPath: sheet.src.replace(/^frontend\/public\//, '/'),
      componentIndex: i,
      componentCount: components.length,
      crop: { x: component.x, y: component.y, w: component.w, h: component.h },
      recommended: i === defaultIndex,
    });
  }
  console.log(`${sheet.id}: wrote ${components.length} candidates`);
}

for (const set of DIRECT_SETS) {
  const sourceDir = repoPath(set.srcDir);
  if (!existsSync(sourceDir)) throw new Error(`missing direct candidate dir ${sourceDir}`);
  const files = readdirSync(sourceDir).filter((file) => file.endsWith('.png')).sort();
  const [expectedW, expectedH] = set.naturalSize;
  const outDir = resolve(publicOutDir, set.id);
  mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < files.length; i += 1) {
    const sourcePath = resolve(sourceDir, files[i]);
    const size = pngSize(sourcePath);
    if (size.width !== expectedW || size.height !== expectedH) {
      throw new Error(`${set.id}: ${files[i]} must be ${expectedW}x${expectedH}px, got ${size.width}x${size.height}; not writing resized candidates`);
    }
    const number = String(i + 1).padStart(2, '0');
    const file = `${set.id}/candidate-${number}.png`;
    copyFileSync(sourcePath, resolve(publicOutDir, file));
    if (set.manifest === false) continue;
    sources.push({
      id: `${set.id}-${number}`,
      label: `${set.label} ${number}`,
      role: set.role,
      kind: set.kind,
      src: `/assets/ui/chrome-candidates/exploded/${file.replace(/\\/g, '/')}`,
      width: size.width,
      height: size.height,
      sourceSheetId: set.id,
      sourceSheetLabel: set.label,
      sourceSheetPath: set.srcDir.replace(/^frontend\/public\//, '/'),
      componentIndex: i,
      componentCount: files.length,
      crop: { x: 0, y: 0, w: size.width, h: size.height },
      recommended: i === 0,
    });
  }
  console.log(`${set.id}: copied ${files.length} candidates`);
}

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `${JSON.stringify({
  generatedBy: 'scripts/explode-chrome-candidate-sheets.mjs',
  sources,
}, null, 2)}\n`);
console.log(`wrote ${manifestPath.replace(root, '')}`);
