// Phase-1 asset normalizer for the `main-menu-mode-button` family.
//
// Hybrid pipeline (method "c"): generated concept art -> mechanical cleanup ->
// reviewable, swappable game assets. This script is the reusable phase-1
// template; later families (icons, tiles, pieces) follow the same shape.
//
// Input  : frontend/public/assets/ui/main-menu-button-art-five-mode.png
//          (state-language reference: main-menu-button-art-three-state.png)
// Output : frontend/public/assets/ui/main-menu/
//            mode-button-<id>.png / @2x          default state
//            mode-button-<id>-disabled.png / @2x mechanical disabled transform
//            contact-sheet.png / @2x             review tiles on a checkerboard
//            mode-buttons.manifest.json          frames + live-text "label" slot
//
// Why flood-fill keying: the buttons sit on a dark background that is nearly the
// same colour as the dark plate, so a naive global colour key eats the plate.
// Instead transparency floods IN from the crop border and stops at the brighter
// frame edge, which preserves the plate interior while removing the surround.
//
// Deterministic and re-runnable. Run: node scripts/normalize-mode-buttons.mjs

import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, '../public/assets/ui');
const OUT_DIR = path.join(UI_DIR, 'main-menu');
const FIVE = path.join(UI_DIR, 'main-menu-button-art-five-mode.png');

// Top-to-bottom order MUST match the buttons in the five-mode sheet.
const MODES = [
  { id: 'skirmish', icon: 'sword', action: 'party', label: 'Solo Skirmish' },
  { id: 'campaign', icon: 'crown', action: 'campaigns', label: 'Campaign Editor' },
  { id: 'editor', icon: 'scroll', action: 'level-editor-preview', label: 'Level Editor' },
  { id: 'multiplayer', icon: 'people', action: 'lobbies', label: 'Lobbies' },
  { id: 'settings', icon: 'gear', action: 'settings', label: 'Settings' },
];

// Low tolerance is deliberate: the dark plate sits only ~14-20 units from the
// near-black background (gaps ~0-3), while the bright metal frame edge is 60+
// away. At tol ~10 the flood removes the margin + rounded-corner triangles but
// physically cannot cross the bright frame to reach (and erase) the plate.
const FLOOD_TOL = 10; // background flood-fill colour tolerance
const GUTTER = 2;     // transparent gutter px around each @1x frame
const FRAME_W = 480;  // @1x runtime frame width

// Reference rects as % of the frame. `label` is the live-DOM-text slot — the
// handshake the renderer (and future artists) build against.
const SLOTS = {
  icon: { x: 2.5, y: 12, w: 21, h: 76 },
  label: { x: 27, y: 17, w: 58, h: 66 },
  chevron: { x: 87.5, y: 32, w: 10, h: 36 },
};

function readPNG(p) {
  const png = PNG.sync.read(fs.readFileSync(p));
  return { w: png.width, h: png.height, data: png.data };
}
function makeImg(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) };
}
function gp(img, x, y) {
  return (y * img.w + x) * 4;
}
function dist2(d, i, r, g, b) {
  const dr = d[i] - r;
  const dg = d[i + 1] - g;
  const db = d[i + 2] - b;
  return dr * dr + dg * dg + db * db;
}

function sampleBg(img) {
  const s = 12;
  const corners = [[0, 0], [img.w - s, 0], [0, img.h - s], [img.w - s, img.h - s]];
  const pts = corners.map(([cx, cy]) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = cy; y < cy + s; y++) {
      for (let x = cx; x < cx + s; x++) {
        const i = gp(img, x, y);
        r += img.data[i];
        g += img.data[i + 1];
        b += img.data[i + 2];
        n++;
      }
    }
    return [r / n, g / n, b / n];
  });
  const avg = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return { r: avg[0] / 4, g: avg[1] / 4, b: avg[2] / 4, corners: pts };
}

function rowInk(img, bg, tol) {
  const t2 = tol * tol;
  const prof = new Array(img.h).fill(0);
  for (let y = 0; y < img.h; y++) {
    let c = 0;
    for (let x = 0; x < img.w; x++) {
      if (dist2(img.data, gp(img, x, y), bg.r, bg.g, bg.b) > t2) c++;
    }
    prof[y] = c;
  }
  return prof;
}

function colInkRange(img, bg, tol, y0, y1) {
  const t2 = tol * tol;
  let x0 = img.w;
  let x1 = -1;
  for (let x = 0; x < img.w; x++) {
    let c = 0;
    for (let y = y0; y < y1; y++) {
      if (dist2(img.data, gp(img, x, y), bg.r, bg.g, bg.b) > t2) c++;
    }
    if (c > (y1 - y0) * 0.06) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return { x0, x1 };
}

function detectBands(prof, w, { minFrac = 0.12, gapMerge = 14, minBand = 24 } = {}) {
  const thr = w * minFrac;
  const active = prof.map((v) => v > thr);
  const bands = [];
  let s = -1;
  for (let y = 0; y < active.length; y++) {
    if (active[y] && s < 0) s = y;
    if ((!active[y] || y === active.length - 1) && s >= 0) {
      bands.push([s, active[y] ? y : y - 1]);
      s = -1;
    }
  }
  const merged = [];
  for (const b of bands) {
    const last = merged[merged.length - 1];
    if (last && b[0] - last[1] <= gapMerge) last[1] = b[1];
    else merged.push(b.slice());
  }
  return merged.filter((b) => b[1] - b[0] + 1 >= minBand);
}

function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = makeImg(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = gp(img, x0 + x, y0 + y);
      const di = gp(out, x, y);
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

// Transparency flows in from the border and stops at the brighter frame edge.
function floodKey(img, bg, tol) {
  const t2 = tol * tol;
  const { w, h, data } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (dist2(data, p * 4, bg.r, bg.g, bg.b) <= t2) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  let keyed = 0;
  while (stack.length) {
    const p = stack.pop();
    data[p * 4 + 3] = 0;
    keyed++;
    const x = p % w;
    const y = (p - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return keyed / (w * h);
}

function trim(img) {
  const { w, h, data } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[gp(img, x, y) + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img;
  return crop(img, x0, y0, x1, y1);
}

// Premultiplied-alpha box average; handles up/down scaling without dark fringe.
function resize(img, tw, th) {
  const out = makeImg(tw, th);
  const { w, h, data } = img;
  for (let ty = 0; ty < th; ty++) {
    const sy0 = Math.floor((ty * h) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * h) / th));
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor((tx * w) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * w) / tw));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = gp(img, sx, sy);
          const al = data[i + 3] / 255;
          r += data[i] * al;
          g += data[i + 1] * al;
          b += data[i + 2] * al;
          a += data[i + 3];
          n++;
        }
      }
      const di = gp(out, tx, ty);
      const as = a / 255;
      out.data[di] = as > 0 ? Math.round(r / as) : 0;
      out.data[di + 1] = as > 0 ? Math.round(g / as) : 0;
      out.data[di + 2] = as > 0 ? Math.round(b / as) : 0;
      out.data[di + 3] = Math.round(a / n);
    }
  }
  return out;
}

function gutter(img, g) {
  const out = makeImg(img.w + 2 * g, img.h + 2 * g);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const si = gp(img, x, y);
      const di = gp(out, x + g, y + g);
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function disabledOf(img) {
  const out = makeImg(img.w, img.h);
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]);
    out.data[i] = Math.round(gray * 0.55 + data[i] * 0.1);
    out.data[i + 1] = Math.round(gray * 0.55 + data[i + 1] * 0.1);
    out.data[i + 2] = Math.round(gray * 0.55 + data[i + 2] * 0.1);
    out.data[i + 3] = Math.round(data[i + 3] * 0.85);
  }
  return out;
}

function writePNG(img, p) {
  const png = new PNG({ width: img.w, height: img.h });
  img.data.copy(png.data);
  fs.writeFileSync(p, PNG.sync.write(png));
}

function checkerboard(w, h, cell = 12) {
  const img = makeImg(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 54 : 38;
      const i = gp(img, x, y);
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c + 4;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function over(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const si = gp(src, x, y);
      const di = gp(dst, dx, dy);
      const sa = src.data[si + 3] / 255;
      const da = 1 - sa;
      dst.data[di] = Math.round(src.data[si] * sa + dst.data[di] * da);
      dst.data[di + 1] = Math.round(src.data[si + 1] * sa + dst.data[di + 1] * da);
      dst.data[di + 2] = Math.round(src.data[si + 2] * sa + dst.data[di + 2] * da);
      dst.data[di + 3] = 255;
    }
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sheet = readPNG(FIVE);
  console.log(`five-mode sheet ${sheet.w}x${sheet.h}`);
  const bg = sampleBg(sheet);
  console.log(
    `bg ~ rgb(${bg.r.toFixed(0)},${bg.g.toFixed(0)},${bg.b.toFixed(0)})  corners ${bg.corners
      .map((c) => c.map((v) => v.toFixed(0)).join(','))
      .join(' | ')}`,
  );
  const prof = rowInk(sheet, bg, FLOOD_TOL);
  const bands = detectBands(prof, sheet.w, { gapMerge: 10 });
  console.log(`detected ${bands.length} bands: ${bands.map((b) => `${b[0]}-${b[1]}`).join(', ')}`);
  if (bands.length !== MODES.length) {
    console.warn(`WARN expected ${MODES.length} bands, got ${bands.length} — tune thresholds`);
  }

  const raws = bands.map((b, idx) => {
    const pad = 8;
    const y0 = Math.max(0, b[0] - pad);
    const y1 = Math.min(sheet.h - 1, b[1] + pad);
    const { x0, x1 } = colInkRange(sheet, bg, FLOOD_TOL, b[0], b[1]);
    const cx0 = Math.max(0, x0 - pad);
    const cx1 = Math.min(sheet.w - 1, x1 + pad);
    let c = crop(sheet, cx0, y0, cx1, y1);
    const frac = floodKey(c, bg, FLOOD_TOL);
    c = trim(c);
    console.log(
      `band ${idx} (${MODES[idx]?.id || '?'}) x[${cx0}-${cx1}] y[${y0}-${y1}] keyed ${(frac * 100).toFixed(1)}% -> ${c.w}x${c.h}`,
    );
    return c;
  });

  const aspects = raws.map((r) => r.h / r.w).sort((a, b) => a - b);
  const medAspect = aspects[Math.floor(aspects.length / 2)];
  const FRAME_H = Math.round(FRAME_W * medAspect);
  console.log(`frame ${FRAME_W}x${FRAME_H} (median aspect ${medAspect.toFixed(3)})`);

  const modesOut = [];
  raws.forEach((raw, idx) => {
    const m = MODES[idx];
    if (!m) return;
    const name = (suffix, x2) => `mode-button-${m.id}${suffix}${x2 ? '@2x' : ''}.png`;
    writePNG(gutter(resize(raw, FRAME_W, FRAME_H), GUTTER), path.join(OUT_DIR, name('', false)));
    writePNG(gutter(resize(raw, FRAME_W * 2, FRAME_H * 2), GUTTER * 2), path.join(OUT_DIR, name('', true)));
    writePNG(gutter(disabledOf(resize(raw, FRAME_W, FRAME_H)), GUTTER), path.join(OUT_DIR, name('-disabled', false)));
    writePNG(gutter(disabledOf(resize(raw, FRAME_W * 2, FRAME_H * 2)), GUTTER * 2), path.join(OUT_DIR, name('-disabled', true)));
    modesOut.push({
      id: m.id,
      icon: m.icon,
      action: m.action,
      label: m.label,
      frames: { default: name('', false), disabled: name('-disabled', false) },
      frames2x: { default: name('', true), disabled: name('-disabled', true) },
    });
  });

  const pad = 18;
  const fw = FRAME_W + 2 * GUTTER;
  const fh = FRAME_H + 2 * GUTTER;
  const cw = pad + 2 * (fw + pad);
  const ch = pad + modesOut.length * (fh + pad);
  const cs = checkerboard(cw, ch);
  modesOut.forEach((m, r) => {
    over(cs, readPNG(path.join(OUT_DIR, m.frames.default)), pad, pad + r * (fh + pad));
    over(cs, readPNG(path.join(OUT_DIR, m.frames.disabled)), pad + (fw + pad), pad + r * (fh + pad));
  });
  writePNG(cs, path.join(OUT_DIR, 'contact-sheet.png'));
  writePNG(resize(cs, cw * 2, ch * 2), path.join(OUT_DIR, 'contact-sheet@2x.png'));

  const manifest = {
    schema: 'asset-family/v1',
    family: 'main-menu-mode-button',
    note:
      'Phase-1 hybrid (c) assets: generated concept art mechanically normalized. ' +
      'Bridge-grade — replace the PNGs in place to upgrade the art with no code change. ' +
      'The `label` slot is the live-DOM-text handshake.',
    generatedFrom: ['main-menu-button-art-five-mode.png', 'main-menu-button-art-three-state.png'],
    frame: { w: FRAME_W, h: FRAME_H, gutter: GUTTER },
    slots: SLOTS,
    states: ['default', 'disabled'],
    modes: modesOut,
    contactSheet: { x1: 'contact-sheet.png', x2: 'contact-sheet@2x.png' },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'mode-buttons.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `wrote ${modesOut.length} modes x ${manifest.states.length} states + contact sheet + manifest -> ${path.relative(process.cwd(), OUT_DIR)}`,
  );
}

main();
