// Build the ground-cover sprite sheets from committed PixelLab tuft sources.
//
// Pipeline (all baked here — never CSS): recolor each source tuft to a
// brighter-than-tile green ramp sampled from the grass tile, 2x downscale (keeps
// it crisp + low), "groundify" (bake a contact shadow + a base value-ramp so it
// reads as growing from the tile, not pasted on), then a base-pinned shear into a
// 6-frame gentle sway. Output: one horizontal 6-frame sheet per variant +
// manifest.json. Re-run after changing a source: `node scripts/build-groundcover.mjs`.
//
// Source of truth = scripts/groundcover/src/<terrain>/<n>.png (committed).
// Output (generated, gitignored-safe to regen) = public/assets/groundcover/<terrain>/.

import pkg from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const { PNG } = pkg;

const TERRAIN = 'grass';
const TILE = 'public/assets/tiles/surface/grass-0.png';
const SRC_DIR = `scripts/groundcover/src/${TERRAIN}`;
const OUT_DIR = `public/assets/groundcover/${TERRAIN}`;

const SWAY = [0, 1, 2, 2, 1, 0]; // px tip lean per frame (half-size sprite)
const padX = 4;

const tile = PNG.sync.read(readFileSync(TILE));
const greens = [];
for (let y = 45; y < 92; y++) for (let x = 8; x < 88; x++) {
  const i = (y * tile.width + x) << 2;
  const r = tile.data[i], g = tile.data[i + 1], b = tile.data[i + 2], a = tile.data[i + 3];
  if (a > 200 && g >= r && g > b) greens.push([r, g, b, 0.299 * r + 0.587 * g + 0.114 * b]);
}
greens.sort((p, q) => p[3] - q[3]);
const darkG = greens[Math.floor(greens.length * 0.06)];
const shadowCol = [Math.round(darkG[0] * 0.62), Math.round(darkG[1] * 0.66), Math.round(darkG[2] * 0.55)];
// brighter-than-ground ramp so the tuft pops; mapping to the tile's OWN greens camouflages it
const anchors = [[40, 62, 26], [64, 100, 36], [104, 150, 52], [146, 190, 76], [184, 220, 112]];
const ramp = [];
for (let i = 0; i < anchors.length - 1; i++) for (let s = 0; s < 3; s++) {
  const t = s / 3, a = anchors[i], b = anchors[i + 1];
  ramp.push([Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]);
}
ramp.push(anchors[anchors.length - 1]);
const pick = (t) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 1))))];

function recolor(s) {
  const o = new PNG({ width: s.width, height: s.height });
  for (let i = 0; i < s.data.length; i += 4) {
    const a = s.data[i + 3];
    if (a < 128) { o.data[i + 3] = 0; continue; }
    const lum = 0.299 * s.data[i] + 0.587 * s.data[i + 1] + 0.114 * s.data[i + 2];
    const c = pick(Math.max(0, Math.min(1, (lum - 26) / (210 - 26))));
    o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; o.data[i + 3] = a;
  }
  return o;
}
function downscale(s) {
  const DW = s.width >> 1, DH = s.height >> 1, d = new PNG({ width: DW, height: DH });
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const si = ((2 * y + dy) * s.width + (2 * x + dx)) << 2;
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
function groundify(d) {
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
function shearFrame(G, baseY, f) {
  const W = G.width + 2 * padX, H = G.height, hgt = Math.max(1, baseY), o = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.max(0, Math.min(1, (baseY - y) / hgt)), shift = Math.round(SWAY[f] * Math.pow(t, 1.7)), sx = x - padX - shift, di = (y * W + x) << 2;
    if (sx < 0 || sx >= G.width || y >= G.height) { o.data[di + 3] = 0; continue; }
    const si = (y * G.width + sx) << 2;
    o.data[di] = G.data[si]; o.data[di + 1] = G.data[si + 1]; o.data[di + 2] = G.data[si + 2]; o.data[di + 3] = G.data[si + 3];
  }
  return o;
}

mkdirSync(OUT_DIR, { recursive: true });
const sources = readdirSync(SRC_DIR).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const variants = [];
for (const file of sources) {
  const id = parseInt(file);
  const gr = groundify(downscale(recolor(PNG.sync.read(readFileSync(`${SRC_DIR}/${file}`)))));
  if (!gr) continue;
  const frameW = gr.G.width + 2 * padX, frameH = gr.G.height;
  const sheet = new PNG({ width: frameW * 6, height: frameH });
  for (let f = 0; f < 6; f++) {
    const fr = shearFrame(gr.G, gr.baseY, f);
    for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
      const si = (y * frameW + x) << 2, di = (y * sheet.width + (f * frameW + x)) << 2;
      sheet.data[di] = fr.data[si]; sheet.data[di + 1] = fr.data[si + 1]; sheet.data[di + 2] = fr.data[si + 2]; sheet.data[di + 3] = fr.data[si + 3];
    }
  }
  writeFileSync(`${OUT_DIR}/v${id}.png`, PNG.sync.write(sheet));
  variants.push({ id, frameW, frameH, baseX: gr.cx + padX, baseY: gr.baseY, w: gr.w });
}
// Typed manifest imported by the runtime registry (no async fetch). Generated.
const SRC_MANIFEST_DIR = 'src/art/groundcover';
mkdirSync(SRC_MANIFEST_DIR, { recursive: true });
const ts = `// AUTO-GENERATED by scripts/build-groundcover.mjs — do not edit by hand.\n`
  + `// Re-run \`node scripts/build-groundcover.mjs\` after changing a source tuft.\n`
  + `export default ${JSON.stringify({ terrain: TERRAIN, frameCount: 6, variants })} as const;\n`;
writeFileSync(`${SRC_MANIFEST_DIR}/${TERRAIN}.generated.ts`, ts);
console.log(`built ${variants.length} ${TERRAIN} ground-cover variants -> ${OUT_DIR} (+ ${SRC_MANIFEST_DIR}/${TERRAIN}.generated.ts)`);
