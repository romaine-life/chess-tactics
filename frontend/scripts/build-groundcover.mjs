// Build ground-cover candidate sheets from explicitly fetched sources, per terrain.
//
// Pipeline (all baked here — never CSS): recolor each source to a brighter-than-tile
// ramp (so it pops, not camouflages), 2x downscale (crisp + low), "groundify" (bake a
// contact shadow + a base value-ramp so it reads as growing from the tile, not pasted
// on), then — for ANIMATED cover (grass, reeds) — a base-pinned shear into a 6-frame
// gentle sway. STATIC cover (pebbles) is a single frame, no sway.
//
// Output: one horizontal sheet per variant plus an outside-repository live-media
// candidate-batch manifest. Pass --api-base to upload that exact batch; without
// it, the manifest is ready for live-media-admin-client.mjs. No source module or
// committed runtime directory is ever produced.

import pkg from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LiveMediaAdminClient,
  readCandidateBatchManifest,
  uploadCandidateBatch,
} from './live-media-admin-client.mjs';
const { PNG } = pkg;

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
};
const sourceRoot = option('--source-dir');
const tileRoot = option('--tile-dir');
const outputRoot = option('--out-dir');
const apiBase = option('--api-base');
const requestedBatchId = option('--batch-id');
if (!sourceRoot || !tileRoot || !outputRoot) {
  console.error('usage: build-groundcover.mjs --source-dir <temp> --tile-dir <temp> --out-dir <temp> [--api-base <url>] [--batch-id <id>]');
  process.exit(2);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
function canonicalPath(candidate) {
  let cursor = resolve(candidate);
  const suffix = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...suffix);
}
function isWithin(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
}
for (const [label, directory] of [
  ['--source-dir', sourceRoot], ['--tile-dir', tileRoot], ['--out-dir', outputRoot],
]) {
  if (isWithin(realpathSync(repoRoot), canonicalPath(directory))) {
    throw new Error(`${label} must be outside the Git repository; ground-cover media is live-backed`);
  }
}

// Per-terrain config. `anchors` is the dark→bright recolor ramp; `animated` cover sways,
// static cover (pebbles) lies flat. `greenOnly` keeps grass's exact original sampling.
const TERRAINS = [
  { terrain: 'grass', tile: 'grass-0.png', greenOnly: true, animated: true, scale: 2,
    anchors: [[40, 62, 26], [64, 100, 36], [104, 150, 52], [146, 190, 76], [184, 220, 112]] },
  { terrain: 'water', tile: 'water-0.png', greenOnly: false, animated: true, scale: 2,
    anchors: [[40, 54, 26], [74, 90, 40], [114, 132, 56], [152, 164, 82], [198, 200, 128]] },
  // Sand: dune/beach grass — reuse the grass tuft sources (`src`), recolored to dry straw-khaki.
  { terrain: 'sand', tile: 'sand-0.png', src: 'grass', greenOnly: false, animated: true, scale: 2,
    anchors: [[58, 52, 28], [92, 84, 42], [134, 120, 62], [172, 156, 92], [206, 196, 138]] },
];

const SWAY = [0, 1, 2, 2, 1, 0];

function sampleDark(tile, greenOnly) {
  const cols = [];
  for (let y = 45; y < 92; y++) for (let x = 8; x < 88; x++) {
    const i = (y * tile.width + x) << 2;
    const r = tile.data[i], g = tile.data[i + 1], b = tile.data[i + 2], a = tile.data[i + 3];
    if (a <= 200) continue;
    if (greenOnly && !(g >= r && g > b)) continue;
    cols.push([r, g, b, 0.299 * r + 0.587 * g + 0.114 * b]);
  }
  cols.sort((p, q) => p[3] - q[3]);
  return cols[Math.floor(cols.length * 0.06)] ?? [40, 40, 40, 40];
}
function buildRamp(anchors) {
  const ramp = [];
  for (let i = 0; i < anchors.length - 1; i++) for (let s = 0; s < 3; s++) {
    const t = s / 3, a = anchors[i], b = anchors[i + 1];
    ramp.push([Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]);
  }
  ramp.push(anchors[anchors.length - 1]);
  return ramp;
}
function recolor(s, ramp) {
  const o = new PNG({ width: s.width, height: s.height });
  for (let i = 0; i < s.data.length; i += 4) {
    if (s.data[i + 3] < 128) { o.data[i + 3] = 0; continue; }
    const lum = 0.299 * s.data[i] + 0.587 * s.data[i + 1] + 0.114 * s.data[i + 2];
    const c = ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(Math.max(0, Math.min(1, (lum - 26) / (210 - 26))) * (ramp.length - 1))))];
    o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; o.data[i + 3] = s.data[i + 3];
  }
  return o;
}
function downscale(s, f) {
  const DW = Math.floor(s.width / f), DH = Math.floor(s.height / f), d = new PNG({ width: DW, height: DH });
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const sx = x * f + dx, sy = y * f + dy; if (sx >= s.width || sy >= s.height) continue;
      const si = (sy * s.width + sx) << 2;
      if (s.data[si + 3] > 128) { r += s.data[si]; g += s.data[si + 1]; b += s.data[si + 2]; c++; }
    }
    const di = (y * DW + x) << 2;
    if (c) { d.data[di] = Math.round(r / c); d.data[di + 1] = Math.round(g / c); d.data[di + 2] = Math.round(b / c); d.data[di + 3] = 255; }
    else d.data[di + 3] = 0;
  }
  return d;
}
function bbox(d) {
  let mnX = 1e9, mxX = -1, mnY = 1e9, mxY = -1, any = false;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
    if (d.data[(y * d.width + x) * 4 + 3] > 128) { any = true; if (x < mnX) mnX = x; if (x > mxX) mxX = x; if (y < mnY) mnY = y; if (y > mxY) mxY = y; }
  }
  return { mnX, mxX, mnY, mxY, any };
}
function groundify(d, darkG, shadowCol) {
  const bb = bbox(d); if (!bb.any) return null;
  const DW = d.width, H = d.height + 5, baseY = bb.mxY, cx = Math.round((bb.mnX + bb.mxX) / 2), hw = (bb.mxX - bb.mnX) / 2 + 4, hh = 3.6;
  const G = new PNG({ width: DW, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < DW; x++) {
    const nx = (x - cx) / hw, ny = (y - (baseY + 1)) / hh, r2 = nx * nx + ny * ny, di = (y * DW + x) << 2;
    if (r2 <= 1) { const rim = r2 > 0.45; if (rim && ((x + y) & 1)) continue; G.data[di] = shadowCol[0]; G.data[di + 1] = shadowCol[1]; G.data[di + 2] = shadowCol[2]; G.data[di + 3] = rim ? 72 : 135; }
  }
  const BASE_K = [0.62, 0.46, 0.3, 0.15];
  for (let y = 0; y < d.height; y++) for (let x = 0; x < DW; x++) {
    const si = (y * DW + x) << 2; if (d.data[si + 3] < 128) continue;
    let r = d.data[si], g = d.data[si + 1], b = d.data[si + 2]; const depth = baseY - y;
    if (depth >= 0 && depth < BASE_K.length) { const k = BASE_K[depth]; r = Math.round(r * (1 - k) + darkG[0] * k); g = Math.round(g * (1 - k) + darkG[1] * k); b = Math.round(b * (1 - k) + darkG[2] * k); }
    const di = (y * DW + x) << 2; G.data[di] = r; G.data[di + 1] = g; G.data[di + 2] = b; G.data[di + 3] = 255;
  }
  return { G, baseY, cx, w: bb.mxX - bb.mnX + 1 };
}
function shearFrame(G, baseY, f, padX) {
  const W = G.width + 2 * padX, H = G.height, hgt = Math.max(1, baseY), o = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.max(0, Math.min(1, (baseY - y) / hgt)), shift = Math.round(SWAY[f] * Math.pow(t, 1.7)), sx = x - padX - shift, di = (y * W + x) << 2;
    if (sx < 0 || sx >= G.width || y >= G.height) { o.data[di + 3] = 0; continue; }
    const si = (y * G.width + sx) << 2;
    o.data[di] = G.data[si]; o.data[di + 1] = G.data[si + 1]; o.data[di + 2] = G.data[si + 2]; o.data[di + 3] = G.data[si + 3];
  }
  return o;
}

let built = 0;
const candidates = [];
for (const cfg of TERRAINS) {
  const SRC_DIR = resolve(sourceRoot, cfg.src ?? cfg.terrain);
  if (!existsSync(SRC_DIR)) { console.log(`skip ${cfg.terrain}: no sources at ${SRC_DIR}`); continue; }
  const sources = readdirSync(SRC_DIR).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  if (sources.length === 0) { console.log(`skip ${cfg.terrain}: empty sources`); continue; }
  const OUT_DIR = resolve(outputRoot, cfg.terrain);
  mkdirSync(OUT_DIR, { recursive: true });
  const tile = PNG.sync.read(readFileSync(resolve(tileRoot, cfg.tile)));
  const darkG = sampleDark(tile, cfg.greenOnly);
  const shadowCol = [Math.round(darkG[0] * 0.62), Math.round(darkG[1] * 0.66), Math.round(darkG[2] * 0.55)];
  const ramp = buildRamp(cfg.anchors);
  const frameCount = cfg.animated ? 6 : 1;
  const padX = cfg.animated ? 4 : 0;
  const variants = [];
  for (const file of sources) {
    const id = parseInt(file);
    const gr = groundify(downscale(recolor(PNG.sync.read(readFileSync(`${SRC_DIR}/${file}`)), ramp), cfg.scale), darkG, shadowCol);
    if (!gr) continue;
    const frameW = gr.G.width + 2 * padX, frameH = gr.G.height;
    const sheet = new PNG({ width: frameW * frameCount, height: frameH });
    for (let f = 0; f < frameCount; f++) {
      const fr = cfg.animated ? shearFrame(gr.G, gr.baseY, f, padX) : gr.G;
      for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
        const si = (y * fr.width + x) << 2, di = (y * sheet.width + (f * frameW + x)) << 2;
        sheet.data[di] = fr.data[si]; sheet.data[di + 1] = fr.data[si + 1]; sheet.data[di + 2] = fr.data[si + 2]; sheet.data[di + 3] = fr.data[si + 3];
      }
    }
    const bytes = PNG.sync.write(sheet);
    writeFileSync(join(OUT_DIR, `v${id}.png`), bytes);
    const groundCover = {
      terrain: cfg.terrain,
      id,
      frameWidth: frameW,
      frameHeight: frameH,
      frameCount,
      baseX: gr.cx + padX,
      baseY: gr.baseY,
      contentWidth: gr.w,
    };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    variants.push(groundCover);
    candidates.push({
      id: `${cfg.terrain}-v${id}`,
      file: `${cfg.terrain}/v${id}.png`,
      slot: `groundcover/${cfg.terrain}/v${id}.png`,
      domain: 'terrain',
      role: 'media',
      label: `${cfg.terrain} ground cover v${id}`,
      availabilityPolicy: 'critical',
      mediaType: 'image/png',
      sourceIds: [],
      metadata: { runtime: { groundCover } },
      provenance: {
        generator: 'frontend/scripts/build-groundcover.mjs',
        pipeline: 'ground-cover-live-candidate-v1',
      },
      nativeEvidence: {
        native1x: true,
        spatialResampling: false,
        sourceWidth: sheet.width,
        sourceHeight: sheet.height,
        sourceSha256: sha256,
      },
    });
  }
  console.log(`built ${variants.length} ${cfg.terrain} variants (${cfg.animated ? 'animated' : 'static'}) -> ${OUT_DIR}`);
  built += 1;
}
if (!candidates.length) throw new Error('No ground-cover candidates were built');
const batchDigest = createHash('sha256')
  .update(JSON.stringify(candidates.map((candidate) => ({
    slot: candidate.slot,
    metadata: candidate.metadata,
    sourceSha256: candidate.nativeEvidence.sourceSha256,
  }))))
  .digest('hex');
const batchId = requestedBatchId || `ground-cover-${batchDigest.slice(0, 24)}`;
const manifestPath = join(resolve(outputRoot), 'live-media-candidate-batch.json');
writeFileSync(manifestPath, `${JSON.stringify({
  schema: 'live-media-candidate-batch-v1',
  batchId,
  sources: [],
  candidates,
}, null, 2)}\n`);
const manifest = readCandidateBatchManifest(manifestPath);

console.log(`done: ${built} terrain(s); live candidate manifest -> ${manifestPath}`);
if (apiBase) {
  const headers = process.env.LIVE_MEDIA_COOKIE ? { Cookie: process.env.LIVE_MEDIA_COOKIE } : {};
  const client = new LiveMediaAdminClient({ apiBase, headers });
  const result = await uploadCandidateBatch({ client, manifest });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`upload with: node frontend/scripts/live-media-admin-client.mjs upload-candidate-batch --api-base <url> --manifest "${manifestPath}"`);
}
