import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SURFACE_DIR = path.join(ROOT, 'public/assets/tiles/surface');
const DEFAULT_OUT_DIR = path.join(ROOT, 'tmp/terrain-asset-diagnostics');

const TILE_W = 96;
const TILE_H = 180;
const TILE_STEP_X = 48;
const TILE_STEP_Y = 27;
const TILE_EQUATOR_Y = 68;

const TOP_DIAMOND = [
  { x: 48, y: 41 },
  { x: 96, y: 68 },
  { x: 48, y: 95 },
  { x: 0, y: 68 },
];

const FAMILIES = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];

function parseArgs(argv) {
  const args = {
    outDir: DEFAULT_OUT_DIR,
    family: '',
    darkThreshold: 45,
    neighborThreshold: 55,
    edgeDistance: 2,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.outDir = path.resolve(ROOT, argv[++i] ?? '');
    else if (arg === '--family') args.family = argv[++i] ?? '';
    else if (arg === '--dark-threshold') args.darkThreshold = Number(argv[++i]);
    else if (arg === '--neighbor-threshold') args.neighborThreshold = Number(argv[++i]);
    else if (arg === '--edge-distance') args.edgeDistance = Number(argv[++i]);
    else if (arg === '--help') {
      console.log([
        'Usage: node scripts/diagnose-terrain-assets.mjs [options]',
        '',
        'Options:',
        '  --family <id>             Restrict to one family: grass, dirt, stone, pebble, sand, water',
        '  --out <dir>               Report directory. Default: frontend/tmp/terrain-asset-diagnostics',
        '  --dark-threshold <0-255>  Opaque pixels below this luminance are suspicious. Default: 45',
        '  --edge-distance <px>      Distance from alpha/mask edge for edge-dark counts. Default: 2',
      ].join('\n'));
      process.exit(0);
    }
  }
  return args;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { force: true, recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > y) !== (pj.y > y)) &&
      (x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function expectedTopMask(width, height) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = pointInPolygon(x + 0.5, y + 0.5, TOP_DIAMOND) ? 1 : 0;
    }
  }
  return mask;
}

function luminance(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

function pixelIndex(width, x, y) {
  return (y * width + x) * 4;
}

function isNearMaskOrAlphaEdge(png, mask, x, y, radius) {
  const { width, height, data } = png;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) return true;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) return true;
      if (!mask[ny * width + nx]) return true;
      if (data[pixelIndex(width, nx, ny) + 3] === 0) return true;
    }
  }
  return false;
}

function localContrast(png, x, y) {
  const { width, height, data } = png;
  const center = luminance(data, pixelIndex(width, x, y));
  let maxDelta = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const nIndex = pixelIndex(width, nx, ny);
      if (data[nIndex + 3] < 220) continue;
      maxDelta = Math.max(maxDelta, Math.abs(center - luminance(data, nIndex)));
    }
  }
  return maxDelta;
}

function paintSourceOverDiagnosticBackground(source, out) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = pixelIndex(source.width, x, y);
      const checker = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2) === 0 ? 18 : 28;
      const bg = [checker, checker + 6, checker + 12];
      const alpha = source.data[i + 3] / 255;
      out.data[i] = Math.round(source.data[i] * alpha + bg[0] * (1 - alpha));
      out.data[i + 1] = Math.round(source.data[i + 1] * alpha + bg[1] * (1 - alpha));
      out.data[i + 2] = Math.round(source.data[i + 2] * alpha + bg[2] * (1 - alpha));
      out.data[i + 3] = 255;
    }
  }
}

function analyzeTopAsset(file, args) {
  const png = readPng(file);
  const mask = expectedTopMask(png.width, png.height);
  const stats = {
    file: path.basename(file),
    relPath: path.relative(ROOT, file).replace(/\\/g, '/'),
    width: png.width,
    height: png.height,
    opaquePixels: 0,
    transparentPixels: 0,
    expectedInteriorPixels: 0,
    transparentInsideMask: 0,
    semiTransparentInsideMask: 0,
    opaqueOutsideMask: 0,
    coloredTransparentPixels: 0,
    darkOpaquePixels: 0,
    darkOpaqueNearEdge: 0,
    highContrastDarkPixels: 0,
    meanOpaqueRgb: [0, 0, 0],
    meanOpaqueLuminance: 0,
    opaqueLuminanceStdDev: 0,
    suspectSamples: [],
  };
  const opaqueTotals = { r: 0, g: 0, b: 0, l: 0, l2: 0, count: 0 };

  const overlay = new PNG({ width: png.width, height: png.height });
  paintSourceOverDiagnosticBackground(png, overlay);

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = pixelIndex(png.width, x, y);
      const alpha = png.data[i + 3];
      const inside = !!mask[y * png.width + x];
      const lum = luminance(png.data, i);
      if (inside) stats.expectedInteriorPixels += 1;
      if (alpha >= 220) stats.opaquePixels += 1;
      if (alpha >= 220 && inside) {
        opaqueTotals.r += png.data[i];
        opaqueTotals.g += png.data[i + 1];
        opaqueTotals.b += png.data[i + 2];
        opaqueTotals.l += lum;
        opaqueTotals.l2 += lum * lum;
        opaqueTotals.count += 1;
      }
      if (alpha === 0) stats.transparentPixels += 1;
      if (alpha === 0 && (png.data[i] !== 0 || png.data[i + 1] !== 0 || png.data[i + 2] !== 0)) {
        stats.coloredTransparentPixels += 1;
      }
      if (inside && alpha === 0) stats.transparentInsideMask += 1;
      if (inside && alpha > 0 && alpha < 220) stats.semiTransparentInsideMask += 1;
      if (!inside && alpha >= 128) stats.opaqueOutsideMask += 1;

      const darkOpaque = alpha >= 220 && lum < args.darkThreshold;
      if (darkOpaque) {
        const nearEdge = isNearMaskOrAlphaEdge(png, mask, x, y, args.edgeDistance);
        const contrast = localContrast(png, x, y);
        stats.darkOpaquePixels += 1;
        if (nearEdge) stats.darkOpaqueNearEdge += 1;
        if (contrast >= 55) stats.highContrastDarkPixels += 1;
        if (stats.suspectSamples.length < 24) {
          stats.suspectSamples.push({
            x,
            y,
            rgba: [png.data[i], png.data[i + 1], png.data[i + 2], alpha],
            luminance: Math.round(lum * 10) / 10,
            nearEdge,
            contrast: Math.round(contrast * 10) / 10,
          });
        }
        if (nearEdge) markPixel(overlay, x, y, [255, 238, 0, 255]);
        else markPixel(overlay, x, y, [68, 172, 255, 255]);
      }

      if (inside && alpha === 0) markPixel(overlay, x, y, [255, 0, 0, 255]);
      if (!inside && alpha >= 128) markPixel(overlay, x, y, [255, 0, 255, 255]);
    }
  }

  if (opaqueTotals.count) {
    stats.meanOpaqueRgb = [
      Math.round(opaqueTotals.r / opaqueTotals.count),
      Math.round(opaqueTotals.g / opaqueTotals.count),
      Math.round(opaqueTotals.b / opaqueTotals.count),
    ];
    stats.meanOpaqueLuminance = Math.round((opaqueTotals.l / opaqueTotals.count) * 10) / 10;
    const variance = Math.max(0, opaqueTotals.l2 / opaqueTotals.count - (opaqueTotals.l / opaqueTotals.count) ** 2);
    stats.opaqueLuminanceStdDev = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  const overlayName = stats.file.replace(/\.png$/, '-diagnostic.png');
  stats.overlay = `overlays/${overlayName}`;
  return { stats, overlay, overlayName };
}

function markPixel(png, x, y, rgba) {
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= png.height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= png.width) continue;
      const i = pixelIndex(png.width, nx, ny);
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
}

function alphaComposite(dst, dstW, dstH, src, x0, y0) {
  for (let y = 0; y < src.height; y += 1) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dstH) continue;
    for (let x = 0; x < src.width; x += 1) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dstW) continue;
      const si = pixelIndex(src.width, x, y);
      const sa = src.data[si + 3] / 255;
      if (sa <= 0) continue;
      const di = pixelIndex(dstW, dx, dy);
      const da = dst.data[di + 3] / 255;
      const outA = sa + da * (1 - sa);
      dst.data[di] = Math.round((src.data[si] * sa + dst.data[di] * da * (1 - sa)) / outA);
      dst.data[di + 1] = Math.round((src.data[si + 1] * sa + dst.data[di + 1] * da * (1 - sa)) / outA);
      dst.data[di + 2] = Math.round((src.data[si + 2] * sa + dst.data[di + 2] * da * (1 - sa)) / outA);
      dst.data[di + 3] = Math.round(outA * 255);
    }
  }
}

function buildPatch(family, files, outFile) {
  const tops = files.filter((file) => path.basename(file).startsWith(`${family}-`));
  if (!tops.length) return null;
  const images = tops.map(readPng);
  const cols = 8;
  const rows = 8;
  const positions = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      positions.push({
        x,
        y,
        left: (x - y) * TILE_STEP_X,
        top: (x + y) * TILE_STEP_Y,
        image: images[(x * 3 + y * 5) % images.length],
      });
    }
  }
  const minLeft = Math.min(...positions.map((p) => p.left - TILE_STEP_X));
  const maxLeft = Math.max(...positions.map((p) => p.left + TILE_STEP_X));
  const minTop = Math.min(...positions.map((p) => p.top - TILE_EQUATOR_Y));
  const maxTop = Math.max(...positions.map((p) => p.top - TILE_EQUATOR_Y + TILE_H));
  const pad = 8;
  const outW = Math.ceil(maxLeft - minLeft + pad * 2);
  const outH = Math.ceil(maxTop - minTop + pad * 2);
  const out = new PNG({ width: outW, height: outH });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 12;
    out.data[i + 1] = 18;
    out.data[i + 2] = 24;
    out.data[i + 3] = 255;
  }
  positions
    .sort((a, b) => (a.x + a.y) - (b.x + b.y))
    .forEach((p) => {
      const dx = Math.round(p.left - TILE_STEP_X - minLeft + pad);
      const dy = Math.round(p.top - TILE_EQUATOR_Y - minTop + pad);
      alphaComposite(out, outW, outH, p.image, dx, dy);
    });
  writePng(outFile, out);
  return path.relative(path.dirname(path.dirname(outFile)), outFile).replace(/\\/g, '/');
}

function topFilesFor(args) {
  const familyPattern = args.family ? args.family : FAMILIES.join('|');
  const re = new RegExp(`^(${familyPattern})-[0-7]-top\\.png$`);
  return fs.readdirSync(SURFACE_DIR)
    .filter((name) => re.test(name))
    .sort()
    .map((name) => path.join(SURFACE_DIR, name));
}

function familyOf(file) {
  return path.basename(file).split('-')[0];
}

function pct(n, d) {
  if (!d) return '0.00%';
  return `${((n / d) * 100).toFixed(2)}%`;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderHtml(report) {
  const rows = report.assets.map((asset) => `
    <tr>
      <td><code>${htmlEscape(asset.file)}</code></td>
      <td><img class="tile" src="../../public/${asset.relPath.replace(/^public\//, '')}" alt=""></td>
      <td><img class="tile" src="${asset.overlay}" alt=""></td>
      <td>${asset.darkOpaquePixels}</td>
      <td>${asset.darkOpaqueNearEdge}</td>
      <td>${asset.highContrastDarkPixels}</td>
      <td>${asset.transparentInsideMask} (${pct(asset.transparentInsideMask, asset.expectedInteriorPixels)})</td>
      <td>${asset.semiTransparentInsideMask}</td>
      <td>${asset.opaqueOutsideMask}</td>
      <td>${asset.coloredTransparentPixels}</td>
      <td>${asset.meanOpaqueLuminance}</td>
      <td>${asset.opaqueLuminanceStdDev}</td>
      <td><pre>${htmlEscape(JSON.stringify(asset.suspectSamples.slice(0, 8), null, 2))}</pre></td>
    </tr>`).join('\n');

  const patchFigures = report.patches.map((patch) => `
    <figure>
      <figcaption>${htmlEscape(patch.family)} same-family patch</figcaption>
      <img class="patch" src="${patch.path}" alt="">
    </figure>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Terrain Asset Diagnostics</title>
  <style>
    body { margin: 24px; background: #111820; color: #dce7ee; font: 14px/1.45 system-ui, sans-serif; }
    h1, h2 { margin: 0 0 12px; }
    p { max-width: 980px; color: #b8c7d2; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #344756; padding: 8px; vertical-align: top; }
    th { position: sticky; top: 0; background: #1d2a35; z-index: 1; }
    .tile { width: 192px; height: 360px; object-fit: contain; image-rendering: pixelated; background: #0b1117; }
    .patch { max-width: min(100%, 980px); image-rendering: pixelated; background: #0b1117; }
    .legend { display: grid; grid-template-columns: repeat(4, max-content); gap: 8px 18px; align-items: center; }
    .swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid #fff8; vertical-align: middle; }
    pre { max-width: 340px; max-height: 220px; overflow: auto; white-space: pre-wrap; font-size: 11px; }
    figure { margin: 18px 0 28px; }
    figcaption { margin-bottom: 8px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Terrain Asset Diagnostics</h1>
  <p>Read-only report generated from committed split tile tops. It does not mutate assets and does not change board rendering.</p>
  <p><strong>Thresholds:</strong> dark luminance &lt; ${report.thresholds.darkThreshold}, edge distance ${report.thresholds.edgeDistance}px.</p>
  <div class="legend">
    <span><span class="swatch" style="background:#ff0"></span> dark opaque near edge</span>
    <span><span class="swatch" style="background:#44acff"></span> dark opaque interior</span>
    <span><span class="swatch" style="background:#f00"></span> transparent inside expected diamond</span>
    <span><span class="swatch" style="background:#f0f"></span> opaque outside expected diamond</span>
  </div>
  <h2>Same-family patches</h2>
  ${patchFigures}
  <h2>Asset table</h2>
  <table>
    <thead>
      <tr>
        <th>Asset</th><th>Source</th><th>Diagnostic overlay</th><th>Dark opaque</th><th>Dark near edge</th><th>High contrast dark</th><th>Transparent inside mask</th><th>Semi-transparent inside</th><th>Opaque outside mask</th><th>Colored transparent</th><th>Mean luminance</th><th>Luminance stdev</th><th>Samples</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

const args = parseArgs(process.argv.slice(2));
if (args.family && !FAMILIES.includes(args.family)) {
  console.error(`Unknown family "${args.family}". Expected one of: ${FAMILIES.join(', ')}`);
  process.exit(1);
}

ensureCleanDir(args.outDir);
const overlayDir = path.join(args.outDir, 'overlays');
const patchDir = path.join(args.outDir, 'patches');
fs.mkdirSync(overlayDir, { recursive: true });
fs.mkdirSync(patchDir, { recursive: true });

const files = topFilesFor(args);
const assets = [];
for (const file of files) {
  const result = analyzeTopAsset(file, args);
  writePng(path.join(overlayDir, result.overlayName), result.overlay);
  assets.push(result.stats);
}

const families = [...new Set(files.map(familyOf))];
const patches = families.map((family) => ({
  family,
  path: buildPatch(family, files, path.join(patchDir, `${family}-same-family-patch.png`)),
})).filter((patch) => patch.path);

const report = {
  generatedAt: new Date().toISOString(),
  surfaceDir: path.relative(ROOT, SURFACE_DIR).replace(/\\/g, '/'),
  thresholds: {
    darkThreshold: args.darkThreshold,
    neighborThreshold: args.neighborThreshold,
    edgeDistance: args.edgeDistance,
  },
  assets,
  patches,
};

fs.writeFileSync(path.join(args.outDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(args.outDir, 'index.html'), renderHtml(report));

const totals = assets.reduce((acc, asset) => {
  acc.darkOpaquePixels += asset.darkOpaquePixels;
  acc.darkOpaqueNearEdge += asset.darkOpaqueNearEdge;
  acc.transparentInsideMask += asset.transparentInsideMask;
  acc.opaqueOutsideMask += asset.opaqueOutsideMask;
  acc.coloredTransparentPixels += asset.coloredTransparentPixels;
  return acc;
}, { darkOpaquePixels: 0, darkOpaqueNearEdge: 0, transparentInsideMask: 0, opaqueOutsideMask: 0, coloredTransparentPixels: 0 });

console.log(`Terrain asset diagnostics wrote ${path.relative(ROOT, args.outDir).replace(/\\/g, '/')}`);
console.log(`Assets: ${assets.length}`);
console.log(`Dark opaque pixels: ${totals.darkOpaquePixels} (${totals.darkOpaqueNearEdge} near edge)`);
console.log(`Transparent pixels inside expected top mask: ${totals.transparentInsideMask}`);
console.log(`Opaque pixels outside expected top mask: ${totals.opaqueOutsideMask}`);
console.log(`Fully transparent pixels with retained RGB: ${totals.coloredTransparentPixels}`);
