// Extract reusable chrome atoms from generated source art.
//
// This is intentionally spec-driven. Generated sheets are allowed to be messy;
// the spec records the human choice of crop boxes, target atom dimensions, rail
// thickness, and transforms that turn that art into deterministic kit inputs.
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const defaultSpec = 'frontend/config/chrome-family-extraction/codex-independent-v1.json';
const specPath = resolve(root, process.argv[2] ?? defaultSpec);

function repoPath(path) {
  return resolve(root, path);
}

function np(width, height) {
  const out = new PNG({ width, height });
  out.data.fill(0);
  return out;
}

function px(src, x, y) {
  const i = (y * src.width + x) * 4;
  return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
}

function setPx(dst, x, y, r, g, b, a) {
  const i = (y * dst.width + x) * 4;
  dst.data[i] = r;
  dst.data[i + 1] = g;
  dst.data[i + 2] = b;
  dst.data[i + 3] = a;
}

function copyPx(src, sx, sy, dst, dx, dy) {
  const [r, g, b, a] = px(src, sx, sy);
  setPx(dst, dx, dy, r, g, b, a);
}

function keyMatches(mode, r, g, b, a) {
  if (a < 8) return true;
  if (mode === 'magenta') return r > 60 && b > 60 && g < 135 && r > g + 28 && b > g + 24;
  if (mode === 'green') return g > 160 && r < 80 && b < 80;
  return false;
}

function keyOut(src, mode) {
  if (!mode) return src;
  const out = np(src.width, src.height);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const [r, g, b, a] = px(src, x, y);
      if (keyMatches(mode, r, g, b, a)) continue;
      setPx(out, x, y, r, g, b, 255);
    }
  }
  return out;
}

function bounds(src) {
  let x0 = src.width;
  let y0 = src.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      if (src.data[(y * src.width + x) * 4 + 3] <= 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < x0 || y1 < y0) throw new Error('no opaque pixels in extracted source');
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(src, x0, y0, width, height) {
  const out = np(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      copyPx(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function trim(src, pad = 0) {
  const b = bounds(src);
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const x1 = Math.min(src.width, b.x0 + b.w + pad);
  const y1 = Math.min(src.height, b.y0 + b.h + pad);
  return crop(src, x0, y0, x1 - x0, y1 - y0);
}

function scaleNearest(src, factor) {
  if (factor === 1) return src;
  const width = Math.max(1, Math.round(src.width * factor));
  const height = Math.max(1, Math.round(src.height * factor));
  const out = np(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor(x / factor));
      const sy = Math.min(src.height - 1, Math.floor(y / factor));
      copyPx(src, sx, sy, out, x, y);
    }
  }
  return out;
}

function fitMax(src, maxSide) {
  return scaleNearest(src, maxSide / Math.max(src.width, src.height));
}

function fitHeight(src, height) {
  return scaleNearest(src, height / src.height);
}

function fitBox(src, width, height) {
  const scaled = scaleNearest(src, Math.min(width / src.width, height / src.height));
  const out = np(width, height);
  const x0 = Math.floor((width - scaled.width) / 2);
  const y0 = Math.floor((height - scaled.height) / 2);
  composite(out, scaled, x0, y0);
  return out;
}

function flipH(src) {
  const out = np(src.width, src.height);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) copyPx(src, src.width - 1 - x, y, out, x, y);
  }
  return out;
}

function flipV(src) {
  const out = np(src.width, src.height);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) copyPx(src, x, src.height - 1 - y, out, x, y);
  }
  return out;
}

function rotateCcw(src) {
  const out = np(src.height, src.width);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) copyPx(src, src.width - 1 - y, x, out, x, y);
  }
  return out;
}

function rotateCw(src) {
  const out = np(src.height, src.width);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) copyPx(src, y, src.height - 1 - x, out, x, y);
  }
  return out;
}

function transform(src, transforms = []) {
  return transforms.reduce((img, t) => {
    if (t === 'flipH') return flipH(img);
    if (t === 'flipV') return flipV(img);
    if (t === 'rotateCcw') return rotateCcw(img);
    if (t === 'rotateCw') return rotateCw(img);
    throw new Error(`unknown transform "${t}"`);
  }, src);
}

function dominantBand(rows, minY, maxY) {
  let best = { y0: 0, y1: 0, score: -1 };
  let y = minY;
  while (y < maxY) {
    while (y < maxY && rows[y] === 0) y += 1;
    const y0 = y;
    let score = 0;
    while (y < maxY && rows[y] > 0) {
      score += rows[y];
      y += 1;
    }
    if (y > y0 && score > best.score) best = { y0, y1: y, score };
  }
  return best;
}

function horizontalRailHeight(src) {
  const rows = new Array(src.height).fill(0);
  for (let y = 0; y < src.height; y += 1) {
    let count = 0;
    for (let x = 0; x < src.width; x += 1) {
      if (src.data[(y * src.width + x) * 4 + 3] > 0) count += 1;
    }
    rows[y] = count > src.width * 0.45 ? count : 0;
  }
  const band = dominantBand(rows, Math.floor(src.height * 0.25), Math.ceil(src.height * 0.75));
  return Math.max(1, band.y1 - band.y0);
}

function teeFromCross(cross) {
  const h = cross.height;
  const colScore = new Array(cross.width).fill(0);
  for (let x = 0; x < cross.width; x += 1) {
    let count = 0;
    for (let y = 0; y < h; y += 1) {
      const inCenter = y > h * 0.38 && y < h * 0.62;
      if (!inCenter && cross.data[(y * cross.width + x) * 4 + 3] > 0) count += 1;
    }
    colScore[x] = count;
  }
  const threshold = Math.max(2, h * 0.2);
  const xs = colScore.map((score, x) => (score > threshold ? x : -1)).filter((x) => x >= 0);
  const verticalLeft = xs.length ? Math.min(...xs) : Math.floor(cross.width * 0.45);
  return trim(crop(cross, verticalLeft, 0, cross.width - verticalLeft, cross.height));
}

function composite(out, img, sx, sy) {
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const [r, g, b, a] = px(img, x, y);
      if (a <= 0) continue;
      const dx = sx + x;
      const dy = sy + y;
      if (dx < 0 || dy < 0 || dx >= out.width || dy >= out.height) continue;
      setPx(out, dx, dy, r, g, b, a);
    }
  }
}

function composeContact(parts) {
  const pad = 18;
  const columns = 4;
  const cellW = Math.max(...parts.map((p) => p.width)) + pad * 2;
  const cellH = Math.max(...parts.map((p) => p.height)) + pad * 2;
  const rows = Math.ceil(parts.length / columns);
  const out = np(pad + columns * cellW + pad, pad + rows * cellH + pad);
  for (let i = 0; i < parts.length; i += 1) {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const part = parts[i];
    const x0 = pad + col * cellW + Math.floor((cellW - part.width) / 2);
    const y0 = pad + row * cellH + Math.floor((cellH - part.height) / 2);
    composite(out, part, x0, y0);
  }
  return out;
}

function writePng(path, png) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
  console.log(`wrote ${path.replace(root, '')} ${png.width}x${png.height}`);
}

function readPiece(spec, family, piece, produced) {
  if (piece.transparent) return np(piece.transparent.w, piece.transparent.h);
  if (piece.derive?.type === 'teeFromCross') return teeFromCross(produced[piece.derive.piece]);

  const sourceDir = repoPath(family.sourceDir ?? spec.sourceDir);
  const sourcePath = resolve(sourceDir, piece.source);
  if (!existsSync(sourcePath)) throw new Error(`missing source ${sourcePath}`);
  let out = PNG.sync.read(readFileSync(sourcePath));
  out = keyOut(out, piece.keyOut ?? family.keyOut ?? spec.keyOut);
  if (piece.crop) out = crop(out, piece.crop.x, piece.crop.y, piece.crop.w, piece.crop.h);
  if (piece.trim) out = trim(out, piece.pad ?? 0);
  out = transform(out, piece.transforms);
  if (piece.fitRailHeight) out = scaleNearest(out, piece.fitRailHeight / horizontalRailHeight(out));
  if (piece.fitHeight) out = fitHeight(out, piece.fitHeight);
  if (piece.fitMax) out = fitMax(out, piece.fitMax);
  if (piece.fit) out = fitBox(out, piece.fit.w, piece.fit.h);
  return out;
}

if (!existsSync(specPath)) throw new Error(`missing extraction spec ${specPath}`);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const atomsDir = repoPath(spec.atomsDir ?? 'frontend/public/assets/ui/kit/atoms');
const outDir = repoPath(spec.outDir);
mkdirSync(atomsDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const contactParts = [];
for (const family of spec.families) {
  const produced = {};
  for (const [pieceId, piece] of Object.entries(family.pieces)) {
    const png = readPiece(spec, family, piece, produced);
    produced[pieceId] = png;
    const atomName = piece.outName ?? `${family.prefix}-${pieceId}`;
    writePng(resolve(atomsDir, `${atomName}.png`), png);
    if (piece.contact !== false) contactParts.push(png);
  }
}

writePng(resolve(outDir, spec.contactSheet ?? 'source-parts-sheet-alpha.png'), composeContact(contactParts));
