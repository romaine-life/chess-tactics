import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../public/assets/ui/campaign-editor/', import.meta.url);
const PROOFS = new URL('../public/assets/ui/proofs/', import.meta.url);
mkdirSync(OUT, { recursive: true });
mkdirSync(PROOFS, { recursive: true });
const outDir = fileURLToPath(OUT);
const proofsDir = fileURLToPath(PROOFS);

const c = {
  clear: [0, 0, 0, 0],
  shadow: [0, 3, 7, 150],
  black: [2, 6, 10, 255],
  panel0: [4, 13, 20, 248],
  panel1: [6, 22, 34, 250],
  panel2: [11, 38, 55, 250],
  field0: [3, 10, 16, 252],
  line: [45, 83, 101, 255],
  lineDim: [22, 50, 66, 255],
  blue: [36, 132, 218, 255],
  blue2: [13, 64, 132, 255],
  cyan: [93, 212, 255, 255],
  cyanSoft: [93, 212, 255, 95],
  gold: [210, 160, 67, 255],
  goldHi: [249, 210, 116, 255],
  goldDeep: [108, 70, 30, 255],
  red: [214, 67, 48, 255],
  red2: [94, 28, 24, 255],
  redHi: [255, 126, 92, 255],
  steel: [122, 142, 148, 255],
  text: [230, 226, 207, 255],
  mute: [136, 151, 157, 255],
};

function png(w, h, fill = c.clear) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) p.data.set(fill, i);
  return p;
}

function set(p, x, y, color) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  p.data.set(color, (p.width * y + x) * 4);
}

function blend(p, x, y, color, strength = 1) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  const i = (p.width * y + x) * 4;
  const a = Math.max(0, Math.min(1, (color[3] / 255) * strength));
  p.data[i] = Math.round(p.data[i] * (1 - a) + color[0] * a);
  p.data[i + 1] = Math.round(p.data[i + 1] * (1 - a) + color[1] * a);
  p.data[i + 2] = Math.round(p.data[i + 2] * (1 - a) + color[2] * a);
  p.data[i + 3] = Math.max(p.data[i + 3], color[3]);
}

function rect(p, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) set(p, xx, yy, color);
  }
}

function hline(p, x, y, w, color) { rect(p, x, y, w, 1, color); }
function vline(p, x, y, h, color) { rect(p, x, y, 1, h, color); }

function line(p, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    set(p, x, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function pointInPoly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function poly(p, points, color) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
      if (pointInPoly(x + 0.5, y + 0.5, points)) set(p, x, y, color);
    }
  }
}

function mix(a, b, t) {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
    Math.round(a[3] * (1 - t) + b[3] * t),
  ];
}

function noise(p, x, y, w, h, alpha = 18) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const n = ((xx * 17 + yy * 31 + (xx ^ yy) * 7) % 23) - 11;
      if (Math.abs(n) > 8) blend(p, xx, yy, [255, 255, 255, alpha], 0.35);
    }
  }
}

function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const si = (src.width * y + x) * 4;
      const a = src.data[si + 3];
      if (!a) continue;
      const di = (dst.width * (dy + y) + dx + x) * 4;
      if (dx + x < 0 || dy + y < 0 || dx + x >= dst.width || dy + y >= dst.height) continue;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = a;
    }
  }
}

function save(name, p, out = OUT) {
  writeFileSync(join(out === OUT ? outDir : proofsDir, name), PNG.sync.write(p));
}

function frame(p, x, y, w, h, {
  accent = c.gold,
  glow = null,
  fillTop = c.panel1,
  fillBottom = c.panel0,
  corner = 18,
  rail = c.line,
  inner = true,
} = {}) {
  rect(p, x + 4, y + 4, w - 8, h - 8, c.shadow);
  for (let yy = y + 6; yy < y + h - 6; yy += 1) {
    const t = (yy - y) / Math.max(1, h);
    hline(p, x + 6, yy, w - 12, mix(fillTop, fillBottom, t));
  }
  noise(p, x + 8, y + 8, w - 16, h - 16, 10);
  hline(p, x + corner, y + 2, w - corner * 2, [255, 244, 182, 85]);
  hline(p, x + corner, y + 3, w - corner * 2, rail);
  hline(p, x + corner, y + h - 4, w - corner * 2, c.black);
  vline(p, x + 3, y + corner, h - corner * 2, rail);
  vline(p, x + w - 4, y + corner, h - corner * 2, c.black);
  hline(p, x + corner + 8, y + 8, w - (corner + 8) * 2, [255, 255, 255, 22]);
  hline(p, x + corner, y + h - 9, w - corner * 2, [0, 0, 0, 70]);
  for (const sx of [x + 8, x + w - corner - 2]) {
    for (const sy of [y + 8, y + h - corner - 2]) {
      rect(p, sx - 2, sy - 2, 4, corner - 4, c.goldDeep);
      rect(p, sx - 2, sy - 2, corner - 4, 4, c.goldDeep);
      hline(p, sx, sy, corner - 6, accent);
      vline(p, sx, sy, corner - 6, accent);
      line(p, sx, sy + corner - 8, sx + corner - 8, sy, accent);
      hline(p, sx + 2, sy + 2, corner - 10, c.goldHi);
    }
  }
  if (inner) {
    hline(p, x + 18, y + 34, w - 36, c.lineDim);
    hline(p, x + 18, y + h - 18, w - 36, c.lineDim);
  }
  if (glow) {
    hline(p, x + 20, y + 4, w - 40, glow);
    hline(p, x + 20, y + h - 5, w - 40, [glow[0], glow[1], glow[2], 130]);
    vline(p, x + 4, y + 22, h - 44, [glow[0], glow[1], glow[2], 110]);
    vline(p, x + w - 5, y + 22, h - 44, [glow[0], glow[1], glow[2], 110]);
  }
}

function labelBar(p, x, y, w, textWidth = 120) {
  rect(p, x, y, w, 34, [4, 14, 21, 230]);
  hline(p, x + 12, y + 34, w - 24, c.lineDim);
  hline(p, x + 20, y + 15, textWidth, c.cyan);
}

function makePanel(name, w, h, labelWidth = 130) {
  const p = png(w, h);
  frame(p, 0, 0, w, h, { accent: c.gold, fillTop: c.panel2, fillBottom: c.panel0 });
  labelBar(p, 12, 12, w - 24, labelWidth);
  save(name, p);
  return p;
}

function makePanelCrest() {
  const p = png(96, 104);
  poly(p, [[48, 2], [77, 14], [70, 50], [58, 50], [48, 92], [38, 50], [26, 50], [19, 14]], c.goldDeep);
  line(p, 48, 2, 77, 14, c.goldHi);
  line(p, 77, 14, 70, 50, c.gold);
  line(p, 70, 50, 58, 50, c.gold);
  line(p, 58, 50, 48, 92, c.gold);
  line(p, 48, 92, 38, 50, c.gold);
  line(p, 38, 50, 26, 50, c.gold);
  line(p, 26, 50, 19, 14, c.goldHi);
  line(p, 19, 14, 48, 2, c.goldHi);
  poly(p, [[48, 12], [66, 20], [61, 42], [53, 42], [48, 70], [43, 42], [35, 42], [30, 20]], [12, 42, 62, 255]);
  poly(p, [[48, 19], [58, 24], [55, 36], [50, 36], [48, 54], [46, 36], [41, 36], [38, 24]], [6, 20, 32, 255]);
  hline(p, 35, 10, 26, c.goldHi);
  hline(p, 39, 18, 18, c.cyan);
  rect(p, 44, 0, 8, 7, c.goldHi);
  rect(p, 46, 7, 4, 8, c.gold);
  hline(p, 33, 49, 30, c.goldHi);
  rect(p, 46, 54, 4, 31, c.goldHi);
  rect(p, 43, 64, 10, 8, c.gold);
  rect(p, 39, 44, 18, 5, c.gold);
  save('panel-crest.png', p);
  return p;
}

function makePreview() {
  const p = png(620, 390);
  frame(p, 0, 0, 620, 390, { accent: c.steel, rail: c.steel, fillTop: [5, 18, 30, 235], fillBottom: [3, 12, 23, 235], inner: false });
  rect(p, 30, 30, 560, 330, [4, 22, 42, 230]);
  rect(p, 38, 38, 544, 314, [5, 30, 57, 112]);
  hline(p, 32, 31, 556, [180, 204, 210, 100]);
  hline(p, 32, 360, 556, [180, 204, 210, 72]);
  vline(p, 31, 32, 326, [180, 204, 210, 72]);
  vline(p, 588, 32, 326, [180, 204, 210, 60]);
  hline(p, 58, 42, 504, [255, 255, 255, 28]);
  hline(p, 58, 348, 504, [0, 0, 0, 72]);
  save('preview-frame.png', p);
  return p;
}

function makeButton(name, w, h, kind = 'primary', pressed = false) {
  const p = png(w, h);
  const map = {
    primary: { accent: c.blue, glow: c.cyan, top: [10, 68, 136, 255], bottom: [4, 30, 68, 255], hi: c.cyan },
    danger: { accent: c.red, glow: c.redHi, top: [94, 32, 28, 255], bottom: [42, 14, 15, 255], hi: c.redHi },
    dark: { accent: c.gold, glow: null, top: c.panel1, bottom: c.panel0, hi: c.goldHi },
  }[kind];
  frame(p, 0, 0, w, h, {
    accent: map.accent,
    glow: pressed ? map.glow : null,
    fillTop: pressed ? mix(map.top, map.hi, 0.12) : map.top,
    fillBottom: map.bottom,
    corner: 22,
    inner: false,
  });
  hline(p, 28, 17, w - 56, pressed ? map.hi : [255, 255, 255, 38]);
  save(name, p);
  return p;
}

function makeSlotChrome(name, w, h, kind = 'primary', selected = false) {
  const p = png(w, h);
  const palette = {
    primary: {
      top: selected ? [12, 91, 172, 255] : [9, 67, 132, 255],
      bottom: selected ? [4, 39, 82, 255] : [4, 28, 63, 255],
      edge: selected ? c.cyan : c.blue,
      corner: c.gold,
      cornerHi: c.goldHi,
    },
    panel: {
      top: selected ? [10, 48, 71, 250] : [7, 25, 36, 250],
      bottom: selected ? [4, 22, 33, 250] : [3, 12, 19, 250],
      edge: selected ? c.cyan : c.line,
      corner: c.gold,
      cornerHi: c.goldHi,
    },
    danger: {
      top: selected ? [124, 42, 35, 255] : [89, 30, 27, 255],
      bottom: selected ? [62, 18, 17, 255] : [38, 12, 13, 255],
      edge: selected ? c.redHi : c.red,
      corner: c.gold,
      cornerHi: c.redHi,
    },
  }[kind];

  rect(p, 0, 0, w, h, c.clear);
  rect(p, 4, 4, w - 8, h - 8, c.shadow);
  for (let yy = 3; yy < h - 3; yy += 1) {
    const t = yy / Math.max(1, h - 1);
    hline(p, 3, yy, w - 6, mix(palette.top, palette.bottom, t));
  }
  noise(p, 6, 6, w - 12, h - 12, 8);
  hline(p, 9, 2, w - 18, [255, 255, 255, 28]);
  hline(p, 8, 4, w - 16, palette.edge);
  hline(p, 8, h - 5, w - 16, [0, 0, 0, 110]);
  vline(p, 4, 8, h - 16, palette.edge);
  vline(p, w - 5, 8, h - 16, [0, 0, 0, 120]);

  const cornerW = Math.min(30, Math.floor(w / 4));
  const cornerH = Math.min(24, Math.floor(h / 2));
  for (const side of ['left', 'right']) {
    const left = side === 'left';
    const x0 = left ? 8 : w - 9;
    const hx = left ? x0 : x0 - cornerW + 1;
    const vx = left ? x0 : x0;
    hline(p, hx, 8, cornerW, palette.corner);
    vline(p, vx, 8, cornerH, palette.corner);
    hline(p, left ? hx + 2 : hx, 10, Math.max(6, cornerW - 8), palette.cornerHi);
    line(p, left ? x0 : x0, h - 9, left ? x0 + 15 : x0 - 15, h - 9, palette.corner);
    line(p, left ? x0 : x0, h - 9, left ? x0 : x0, h - 22, palette.corner);
    line(p, left ? x0 + 3 : x0 - 3, h - 12, left ? x0 + 19 : x0 - 19, h - 12, palette.edge);
  }
  if (selected) {
    hline(p, 18, 6, Math.max(24, Math.floor(w * .18)), c.cyan);
    hline(p, w - 18 - Math.max(24, Math.floor(w * .18)), 6, Math.max(24, Math.floor(w * .18)), c.cyan);
  }
  save(name, p);
  return p;
}

function makeSliceFrame(name, kind = 'panel', selected = false) {
  const w = 96;
  const h = 64;
  const slice = 18;
  const p = png(w, h);
  const palette = {
    primary: {
      top: selected ? [13, 86, 159, 255] : [8, 62, 124, 255],
      bottom: selected ? [4, 38, 82, 255] : [3, 26, 58, 255],
      rail: selected ? c.cyan : c.blue,
      railDim: selected ? [55, 153, 226, 255] : [20, 83, 152, 255],
      cap: c.gold,
      capHi: c.goldHi,
    },
    panel: {
      top: selected ? [9, 47, 68, 250] : [6, 25, 36, 250],
      bottom: selected ? [3, 22, 33, 250] : [2, 12, 20, 250],
      rail: selected ? c.cyan : c.line,
      railDim: selected ? [36, 132, 165, 255] : c.lineDim,
      cap: c.gold,
      capHi: c.goldHi,
    },
    danger: {
      top: selected ? [122, 41, 36, 255] : [86, 28, 26, 255],
      bottom: selected ? [61, 18, 17, 255] : [37, 12, 13, 255],
      rail: selected ? c.redHi : c.red,
      railDim: selected ? [190, 55, 46, 255] : c.red2,
      cap: c.gold,
      capHi: c.redHi,
    },
  }[kind];

  rect(p, 0, 0, w, h, c.clear);
  rect(p, 4, 4, w - 8, h - 8, c.shadow);
  for (let yy = 5; yy < h - 5; yy += 1) {
    const t = (yy - 5) / Math.max(1, h - 10);
    hline(p, 5, yy, w - 10, mix(palette.top, palette.bottom, t));
  }

  hline(p, slice, 4, w - slice * 2, [255, 255, 255, 38]);
  hline(p, slice, 6, w - slice * 2, palette.rail);
  hline(p, slice, h - 7, w - slice * 2, palette.railDim);
  hline(p, slice, h - 5, w - slice * 2, [0, 0, 0, 145]);
  vline(p, 6, slice, h - slice * 2, palette.rail);
  vline(p, w - 7, slice, h - slice * 2, palette.railDim);
  vline(p, 4, slice, h - slice * 2, [255, 255, 255, 25]);
  vline(p, w - 5, slice, h - slice * 2, [0, 0, 0, 135]);

  const hseg = (x, y, len, sx, color) => {
    for (let i = 0; i < len; i += 1) set(p, x + i * sx, y, color);
  };
  const vseg = (x, y, len, sy, color) => {
    for (let i = 0; i < len; i += 1) set(p, x, y + i * sy, color);
  };
  const block = (x, y, bw, bh, sx, sy, color) => {
    for (let yy = 0; yy < bh; yy += 1) {
      for (let xx = 0; xx < bw; xx += 1) set(p, x + xx * sx, y + yy * sy, color);
    }
  };
  const drawCorner = (x, y, sx, sy) => {
    block(x, y, 3, 3, sx, sy, palette.capHi);
    hseg(x, y + 5 * sy, 12, sx, palette.cap);
    hseg(x, y + 7 * sy, 8, sx, palette.capHi);
    vseg(x + 5 * sx, y, 12, sy, palette.cap);
    vseg(x + 7 * sx, y, 8, sy, palette.capHi);
    hseg(x + 2 * sx, y + 12 * sy, 8, sx, c.goldDeep);
    vseg(x + 12 * sx, y + 2 * sy, 8, sy, c.goldDeep);
  };

  drawCorner(6, 6, 1, 1);
  drawCorner(w - 7, 6, -1, 1);
  drawCorner(6, h - 7, 1, -1);
  drawCorner(w - 7, h - 7, -1, -1);

  if (selected) {
    hline(p, slice + 2, 8, w - slice * 2 - 4, c.cyan);
    hline(p, slice + 2, h - 9, w - slice * 2 - 4, [93, 212, 255, 150]);
  }

  save(name, p);
  return p;
}

function makeIconButton(name, kind = 'normal') {
  const p = png(88, 88);
  const selected = kind === 'selected';
  const danger = kind === 'danger';
  frame(p, 0, 0, 88, 88, {
    accent: danger ? c.red : selected ? c.cyan : c.gold,
    glow: danger ? c.redHi : selected ? c.cyan : null,
    fillTop: danger ? [70, 24, 22, 255] : selected ? [9, 58, 90, 255] : c.panel1,
    fillBottom: danger ? [34, 10, 12, 255] : c.panel0,
    corner: 18,
    inner: false,
  });
  save(name, p);
  return p;
}

function makeField(name, w, h, select = false) {
  const p = png(w, h);
  frame(p, 0, 0, w, h, { accent: c.line, rail: c.line, fillTop: c.field0, fillBottom: c.black, corner: 14, inner: false });
  hline(p, 18, 10, w - (select ? 74 : 36), [255, 255, 255, 22]);
  if (select) {
    rect(p, w - 56, 14, 36, h - 28, [6, 18, 25, 255]);
    hline(p, w - 45, Math.floor(h / 2) - 3, 18, c.gold);
    hline(p, w - 41, Math.floor(h / 2) + 1, 10, c.goldHi);
  }
  save(name, p);
  return p;
}

function makeRow(name, selected = false, shield = false) {
  const p = png(360, 86);
  frame(p, 0, 0, 360, 86, {
    accent: selected ? c.cyan : c.line,
    glow: selected ? c.cyan : null,
    fillTop: selected ? [9, 45, 68, 248] : c.panel1,
    fillBottom: c.panel0,
    corner: 16,
    rail: selected ? c.cyan : c.line,
    inner: false,
  });
  if (shield) rect(p, 18, 13, 54, 60, [5, 16, 23, 210]);
  if (selected) {
    hline(p, 12, 6, 64, c.cyan);
    hline(p, 284, 6, 64, c.cyan);
    hline(p, 12, 79, 64, c.cyan);
    hline(p, 284, 79, 64, c.cyan);
  }
  save(name, p);
  return p;
}

function makeShield(name, motif) {
  const p = png(88, 116);
  const outer = [[44, 6], [70, 17], [67, 76], [44, 106], [21, 76], [18, 17]];
  const inner = [[44, 13], [64, 22], [61, 72], [44, 96], [27, 72], [24, 22]];
  poly(p, outer, c.goldDeep);
  line(p, 44, 6, 70, 17, c.goldHi);
  line(p, 70, 17, 67, 76, c.gold);
  line(p, 67, 76, 44, 106, c.gold);
  line(p, 44, 106, 21, 76, c.gold);
  line(p, 21, 76, 18, 17, c.goldHi);
  line(p, 18, 17, 44, 6, c.goldHi);
  for (let y = 13; y <= 96; y += 1) {
    const t = (y - 13) / 83;
    for (let x = 20; x <= 68; x += 1) {
      if (pointInPoly(x + 0.5, y + 0.5, inner)) set(p, x, y, mix([11, 45, 67, 255], [3, 15, 26, 255], t));
    }
  }
  poly(p, [[44, 15], [63, 23], [60, 38], [44, 34], [28, 38], [25, 23]], [14, 72, 108, 150]);
  hline(p, 30, 17, 28, c.goldHi);
  rect(p, 37, 2, 14, 9, c.goldHi);
  rect(p, 39, 11, 10, 4, c.gold);
  const col = motif === 'flame' ? c.redHi : motif === 'snow' ? [223, 243, 250, 255] : motif === 'crescent' ? [224, 206, 150, 255] : motif === 'crown' ? c.goldHi : c.text;
  const shade = motif === 'flame' ? c.red : motif === 'crown' ? c.gold : [164, 180, 181, 255];
  if (motif === 'lion') {
    poly(p, [[38, 34], [52, 32], [58, 42], [53, 54], [45, 50], [41, 72], [30, 72], [34, 50], [27, 44]], col);
    rect(p, 47, 28, 10, 10, col);
    rect(p, 55, 35, 5, 5, shade);
    rect(p, 28, 61, 8, 17, col);
    rect(p, 47, 59, 7, 18, col);
  } else if (motif === 'rook') {
    rect(p, 29, 33, 6, 12, col); rect(p, 41, 33, 6, 12, col); rect(p, 53, 33, 6, 12, col);
    rect(p, 32, 45, 24, 31, col);
    rect(p, 27, 76, 34, 7, col);
    rect(p, 38, 54, 12, 22, [7, 25, 38, 255]);
  } else if (motif === 'crescent') {
    poly(p, [[35, 30], [51, 34], [58, 48], [53, 65], [40, 75], [29, 72], [40, 62], [45, 49], [42, 37]], col);
    poly(p, [[45, 28], [61, 38], [62, 58], [51, 73], [41, 74], [51, 61], [54, 46]], [8, 28, 42, 255]);
  } else if (motif === 'snow') {
    rect(p, 42, 28, 5, 50, col); rect(p, 25, 50, 39, 5, col);
    line(p, 31, 35, 58, 70, col); line(p, 58, 35, 31, 70, col);
    rect(p, 30, 30, 6, 6, col); rect(p, 54, 30, 6, 6, col); rect(p, 30, 71, 6, 6, col); rect(p, 54, 71, 6, 6, col);
  } else if (motif === 'flame') {
    poly(p, [[44, 27], [55, 45], [51, 76], [35, 76], [29, 57], [37, 47]], col);
    poly(p, [[43, 41], [50, 56], [47, 74], [36, 74], [34, 59]], c.goldHi);
    rect(p, 31, 69, 25, 8, c.red);
  } else if (motif === 'crown') {
    rect(p, 27, 55, 35, 18, col);
    poly(p, [[28, 55], [33, 34], [40, 55]], col);
    poly(p, [[39, 55], [45, 27], [51, 55]], col);
    poly(p, [[50, 55], [58, 36], [61, 55]], col);
    hline(p, 29, 64, 31, [92, 58, 23, 255]);
  }
  hline(p, 30, 87, 28, [0, 0, 0, 95]);
  save(`shield-${motif}.png`, p);
  return p;
}

function makeSourceSheet(parts) {
  const p = png(1536, 1024, [12, 16, 20, 255]);
  rect(p, 0, 0, 1536, 1024, [7, 12, 18, 255]);
  let x = 26;
  let y = 24;
  for (const part of parts) {
    if (x + part.img.width > 1510) {
      x = 26;
      y += 130;
    }
    blit(p, part.img, x, y);
    x += part.img.width + 24;
  }
  save('source-sheet.png', p);
  save('campaign-editor-ui-kit-source-02.png', p, PROOFS);
}

const parts = [
  { name: 'panel-large.png', img: makePanel('panel-large.png', 645, 411, 150) },
  { name: 'panel-card.png', img: makePanel('panel-card.png', 493, 177, 120) },
  { name: 'panel-crest.png', img: makePanelCrest() },
  { name: 'preview-frame.png', img: makePreview() },
  { name: 'footer-bar.png', img: makePanel('footer-bar.png', 1176, 128, 0) },
  { name: 'row-campaign.png', img: makeRow('row-campaign.png', false, true) },
  { name: 'row-campaign-selected.png', img: makeRow('row-campaign-selected.png', true, true) },
  { name: 'row-level.png', img: makeRow('row-level.png', false, false) },
  { name: 'row-level-selected.png', img: makeRow('row-level-selected.png', true, false) },
  { name: 'slice-row-panel.png', img: makeSliceFrame('slice-row-panel.png', 'panel', false) },
  { name: 'slice-row-panel-selected.png', img: makeSliceFrame('slice-row-panel-selected.png', 'panel', true) },
  { name: 'slice-button-primary.png', img: makeSliceFrame('slice-button-primary.png', 'primary', false) },
  { name: 'slice-button-primary-selected.png', img: makeSliceFrame('slice-button-primary-selected.png', 'primary', true) },
  { name: 'slice-button-danger.png', img: makeSliceFrame('slice-button-danger.png', 'danger', false) },
  { name: 'button-blue.png', img: makeButton('button-blue.png', 226, 87, 'primary', false) },
  { name: 'button-blue-pressed.png', img: makeButton('button-blue-pressed.png', 253, 87, 'primary', true) },
  { name: 'button-red.png', img: makeButton('button-red.png', 226, 86, 'danger', false) },
  { name: 'button-red-pressed.png', img: makeButton('button-red-pressed.png', 253, 86, 'danger', true) },
  { name: 'icon-button.png', img: makeIconButton('icon-button.png') },
  { name: 'icon-button-selected.png', img: makeIconButton('icon-button-selected.png', 'selected') },
  { name: 'icon-button-red.png', img: makeIconButton('icon-button-red.png', 'danger') },
  { name: 'field-input.png', img: makeField('field-input.png', 482, 38, false) },
  { name: 'field-select.png', img: makeField('field-select.png', 482, 74, true) },
  { name: 'shield-lion.png', img: makeShield('shield-lion.png', 'lion') },
  { name: 'shield-rook.png', img: makeShield('shield-rook.png', 'rook') },
  { name: 'shield-crescent.png', img: makeShield('shield-crescent.png', 'crescent') },
  { name: 'shield-snow.png', img: makeShield('shield-snow.png', 'snow') },
  { name: 'shield-flame.png', img: makeShield('shield-flame.png', 'flame') },
  { name: 'shield-crown.png', img: makeShield('shield-crown.png', 'crown') },
];

makeSourceSheet(parts);
