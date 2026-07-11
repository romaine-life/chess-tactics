import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..');
const repo = path.resolve(frontend, '..');
const tiles = path.join(frontend, 'public', 'assets', 'tiles');
const surface = path.join(tiles, 'surface');
const families = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'];
const landFamilies = ['grass', 'dirt', 'stone', 'pebble', 'sand'];
const waterFrames = 8;
const muralWindows = 48;
const featurePieces = { fossil: 6, ruins: 5 };
const expectedSurfaceFiles = new Set();
const failures = [];

function fail(message) {
  failures.push(message);
}

function requireFile(file) {
  if (!fs.existsSync(file)) fail(`missing required tile layer: ${path.relative(repo, file)}`);
}

function requireSurface(name) {
  expectedSurfaceFiles.add(name);
  requireFile(path.join(surface, name));
}

function png(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function assertDisjoint(topPath, sidePath) {
  if (!fs.existsSync(topPath) || !fs.existsSync(sidePath)) return;
  const top = png(topPath);
  const side = png(sidePath);
  if (top.width !== 96 || top.height !== 180 || side.width !== 96 || side.height !== 180) {
    fail(`tile layers must both be 96x180: ${path.basename(topPath)} / ${path.basename(sidePath)}`);
    return;
  }
  let topPixels = 0;
  let sidePixels = 0;
  for (let pixel = 0; pixel < top.width * top.height; pixel += 1) {
    const offset = pixel * 4 + 3;
    const topAlpha = top.data[offset];
    const sideAlpha = side.data[offset];
    if ((topAlpha !== 0 && topAlpha !== 255) || (sideAlpha !== 0 && sideAlpha !== 255)) {
      fail(`base top and side must use hard alpha: ${path.basename(topPath)} / ${path.basename(sidePath)}`);
      return;
    }
    if (topAlpha > 0) topPixels += 1;
    if (sideAlpha > 0) sidePixels += 1;
    if (topAlpha > 0 && sideAlpha > 0) {
      fail(`top and side overlap at pixel ${pixel}: ${path.basename(topPath)} / ${path.basename(sidePath)}`);
      return;
    }
  }
  if (topPixels === 0 || sidePixels === 0) {
    fail(`top and side must both contain art: ${path.basename(topPath)} / ${path.basename(sidePath)}`);
  }
}

function assertWaterSheet(topPath, sheetPath) {
  if (!fs.existsSync(topPath) || !fs.existsSync(sheetPath)) return;
  const top = png(topPath);
  const sheet = png(sheetPath);
  if (sheet.width !== 96 * waterFrames || sheet.height !== 180) {
    fail(`animated top must be ${waterFrames} 96x180 frames: ${path.relative(repo, sheetPath)} is ${sheet.width}x${sheet.height}`);
    return;
  }
  for (let frame = 0; frame < waterFrames; frame += 1) {
    for (let y = 0; y < top.height; y += 1) {
      for (let x = 0; x < top.width; x += 1) {
        const topOffset = (y * top.width + x) * 4;
        const sheetOffset = (y * sheet.width + frame * top.width + x) * 4;
        if (sheet.data[sheetOffset + 3] !== top.data[topOffset + 3]) {
          fail(`animated top alpha differs from static top in frame ${frame}: ${path.relative(repo, sheetPath)}`);
          return;
        }
        if (frame === 0) {
          for (let channel = 0; channel < 4; channel += 1) {
            if (sheet.data[sheetOffset + channel] !== top.data[topOffset + channel]) {
              fail(`animated top frame 0 differs from static top: ${path.relative(repo, sheetPath)}`);
              return;
            }
          }
        }
      }
    }
  }
}

function assertAlphaRegion(file, canonicalTop, ownsTop) {
  if (!fs.existsSync(file)) return;
  const image = png(file);
  if (image.width !== canonicalTop.width || image.height !== canonicalTop.height) {
    fail(`tile source must be ${canonicalTop.width}x${canonicalTop.height}: ${path.relative(repo, file)}`);
    return;
  }
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    const alphaOffset = pixel * 4 + 3;
    const insideTop = canonicalTop.data[alphaOffset] > 0;
    if (image.data[alphaOffset] > 0 && insideTop !== ownsTop) {
      fail(`${ownsTop ? 'top' : 'side'} source owns alpha in the wrong region: ${path.relative(repo, file)}`);
      return;
    }
  }
}

for (const family of families) {
  for (let variant = 0; variant < 8; variant += 1) {
    const topName = `${family}-${variant}-top.png`;
    const sideName = `${family}-${variant}-side.png`;
    const top = path.join(surface, topName);
    const side = path.join(surface, sideName);
    requireSurface(topName);
    requireSurface(sideName);
    assertDisjoint(top, side);
    if (family === 'water') {
      const sheetName = `${family}-${variant}-top-anim.png`;
      const sheet = path.join(surface, sheetName);
      requireSurface(sheetName);
      assertWaterSheet(top, sheet);
    }
  }
}

const canonicalTop = png(path.join(surface, 'grass-0-top.png'));

for (const family of landFamilies) {
  for (let variant = 0; variant < 3; variant += 1) {
    const name = `${family}-edge-${variant}-side.png`;
    const file = path.join(surface, name);
    requireSurface(name);
    assertAlphaRegion(file, canonicalTop, false);
  }
  for (let window = 0; window < muralWindows; window += 1) {
    const name = `${family}-mural-${window}-side.png`;
    const file = path.join(surface, name);
    requireSurface(name);
    assertAlphaRegion(file, canonicalTop, false);
  }
  const edgeMask = path.join(repo, 'docs', 'art', 'tile-concepts', 'edge-masks', `${family}-edge-side.png`);
  requireFile(edgeMask);
  assertAlphaRegion(edgeMask, canonicalTop, false);
}

for (const [feature, count] of Object.entries(featurePieces)) {
  for (let piece = 0; piece < count; piece += 1) {
    const name = `${feature}-${piece}-side.png`;
    const file = path.join(surface, name);
    requireSurface(name);
    assertAlphaRegion(file, canonicalTop, false);
  }
  const capName = `${feature}-cap-side.png`;
  const cap = path.join(surface, capName);
  requireSurface(capName);
  assertAlphaRegion(cap, canonicalTop, false);
}

for (const family of families) {
  const sideTemplate = path.join(repo, 'docs', 'art', 'tile-concepts', 'side-templates', `${family}-side.png`);
  const topUnderlay = path.join(repo, 'docs', 'art', 'tile-concepts', 'top-underlays', `${family}-top-underlay.png`);
  requireFile(sideTemplate);
  requireFile(topUnderlay);
  assertAlphaRegion(sideTemplate, canonicalTop, false);
  assertAlphaRegion(topUnderlay, canonicalTop, true);
}

if (fs.existsSync(surface)) {
  for (const name of fs.readdirSync(surface)) {
    if (!name.endsWith('.png')) continue;
    if (!/-(?:top|side|top-anim)\.png$/.test(name)) {
      fail(`combined or unclassified surface PNG returned: frontend/public/assets/tiles/surface/${name}`);
    }
    if (/^(grass|dirt|stone|pebble|sand)-edge-side\.png$/.test(name)) {
      fail(`build-only edge mask returned to public assets: frontend/public/assets/tiles/surface/${name}`);
    }
    if (!expectedSurfaceFiles.has(name)) {
      fail(`unregistered surface PNG returned: frontend/public/assets/tiles/surface/${name}`);
    }
  }
}

for (const directory of ['pixel', 'pixel-raw', 'speculative', 'textured']) {
  const full = path.join(tiles, directory);
  if (fs.existsSync(full)) {
    const pngs = fs.readdirSync(full, { recursive: true }).filter((name) => String(name).endsWith('.png'));
    if (pngs.length > 0) fail(`retired whole-tile directory returned: frontend/public/assets/tiles/${directory}`);
  }
}

function sourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:ts|tsx|js|mjs|py)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const guardPath = path.resolve(fileURLToPath(import.meta.url));
const sourceGuardExceptions = new Set([
  guardPath,
  path.resolve(frontend, 'src', 'ui', 'tileLayerUi.test.ts'),
]);
const retiredTokens = [
  'split-tiles.py',
  'repair-surface-top-bleed.py',
  'correct-iso-tile-angle.py',
  '/assets/tiles/textured/',
  '/assets/tiles/speculative/',
  '/assets/tiles/pixel-raw/',
  'TileCompareLab',
  'nonProductionTiles',
  '/tile-compare',
  'render_tile.py',
  'render_tile_3d.py',
  'assetFrameSrc',
  'tileFrameSrc',
  'terrainTopSrc',
  'terrainSideSrc',
];
const liveSources = [
  ...sourceFiles(path.join(frontend, 'src')),
  ...sourceFiles(path.join(frontend, 'scripts')),
  ...sourceFiles(path.join(repo, 'packages', 'board-render', 'src')),
  ...sourceFiles(path.join(repo, 'docs', 'art', 'tile-concepts')),
].filter((file) => !sourceGuardExceptions.has(path.resolve(file)));

const retiredPaths = [
  path.join(frontend, 'scripts', 'split-tiles.py'),
  path.join(frontend, 'scripts', 'repair-surface-top-bleed.py'),
  path.join(frontend, 'scripts', 'correct-iso-tile-angle.py'),
  path.join(frontend, 'src', 'art', 'nonProductionTiles.ts'),
  path.join(frontend, 'src', 'ui', 'TileCompareLab.tsx'),
  path.join(repo, 'docs', 'art', 'tile-concepts', 'render_tile.py'),
  path.join(repo, 'docs', 'art', 'tile-concepts', 'render_tile_3d.py'),
  path.join(repo, 'docs', 'art', 'tile-concepts', 'recipe'),
];

for (const retiredPath of retiredPaths) {
  if (fs.existsSync(retiredPath)) fail(`retired whole-tile path returned: ${path.relative(repo, retiredPath)}`);
}

for (const file of liveSources) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of retiredTokens) {
    if (source.includes(token)) fail(`retired tile-layer token ${JSON.stringify(token)} remains in ${path.relative(repo, file)}`);
  }
  if (/\.replace\(\/\\\.png\$\/,\s*['"]-(?:top|side)\.png['"]\)/.test(source)) {
    fail(`tile layer is still derived from a filename stem in ${path.relative(repo, file)}`);
  }
}

if (failures.length > 0) {
  console.error(`tile layer asset check failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('tile layer asset check passed: explicit top/side assets only');
