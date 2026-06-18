import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../public/assets/ui/utility/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const colors = {
  transparent: [0, 0, 0, 0],
  shadow: [2, 6, 10, 190],
  black: [3, 7, 11, 255],
  navy0: [5, 14, 22, 255],
  navy1: [8, 24, 34, 255],
  navy2: [13, 39, 52, 255],
  steel: [40, 72, 86, 255],
  steelHi: [86, 126, 139, 255],
  gold: [205, 165, 74, 255],
  goldHi: [255, 220, 126, 255],
  cyan: [88, 204, 255, 255],
  cyanDim: [18, 96, 140, 255],
  red: [224, 70, 61, 255],
  redDim: [96, 30, 29, 255],
  ink: [238, 244, 238, 255],
};

function png(w, h) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) p.data.set(colors.transparent, i);
  return p;
}

function set(p, x, y, c) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  p.data.set(c, (p.width * y + x) * 4);
}

function rect(p, x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(p, xx, yy, c);
}

function hline(p, x, y, w, c) { rect(p, x, y, w, 1, c); }
function vline(p, x, y, h, c) { rect(p, x, y, 1, h, c); }

function bevelBox(p, x, y, w, h, { accent = colors.gold, glow = null, fillTop = colors.navy2, fillBottom = colors.navy1 } = {}) {
  rect(p, x + 4, y + 4, w - 8, h - 8, fillBottom);
  for (let yy = y + 5; yy < y + h - 5; yy++) {
    const t = (yy - y) / h;
    const c = [
      Math.round(fillTop[0] * (1 - t) + fillBottom[0] * t),
      Math.round(fillTop[1] * (1 - t) + fillBottom[1] * t),
      Math.round(fillTop[2] * (1 - t) + fillBottom[2] * t),
      255,
    ];
    hline(p, x + 5, yy, w - 10, c);
  }
  rect(p, x + 8, y + 8, w - 16, h - 16, [0, 0, 0, 18]);
  hline(p, x + 8, y + 7, w - 16, colors.steelHi);
  hline(p, x + 8, y + h - 8, w - 16, colors.black);
  vline(p, x + 7, y + 8, h - 16, colors.steel);
  vline(p, x + w - 8, y + 8, h - 16, colors.black);
  hline(p, x + 14, y + 3, w - 28, accent);
  hline(p, x + 18, y + 4, w - 36, colors.goldHi);
  hline(p, x + 14, y + h - 4, w - 28, accent);
  vline(p, x + 3, y + 14, h - 28, accent);
  vline(p, x + w - 4, y + 14, h - 28, accent);
  rect(p, x + 5, y + 5, 8, 8, accent);
  rect(p, x + w - 13, y + 5, 8, 8, accent);
  rect(p, x + 5, y + h - 13, 8, 8, accent);
  rect(p, x + w - 13, y + h - 13, 8, 8, accent);
  hline(p, x + 22, y + 14, w - 44, [255, 255, 255, 20]);
  if (glow) {
    hline(p, x + 18, y + h - 12, w - 36, glow);
    hline(p, x + 20, y + h - 11, w - 40, [glow[0], glow[1], glow[2], 150]);
  }
}

function save(name, p) {
  writeFileSync(join(OUT.pathname, name), PNG.sync.write(p));
}

function makeHeader() {
  const p = png(760, 128);
  rect(p, 16, 22, 728, 88, colors.shadow);
  bevelBox(p, 24, 12, 712, 96, { accent: colors.gold, glow: colors.cyan });
  rect(p, 56, 31, 82, 58, [6, 18, 27, 230]);
  hline(p, 62, 38, 70, colors.cyan);
  hline(p, 62, 83, 70, colors.gold);
  rect(p, 164, 32, 528, 6, [255, 255, 255, 18]);
  rect(p, 164, 78, 350, 5, [88, 204, 255, 60]);
  save('page-header.png', p);
}

function makePanel() {
  const p = png(320, 160);
  rect(p, 10, 12, 300, 136, colors.shadow);
  bevelBox(p, 14, 8, 292, 140, { accent: colors.gold });
  rect(p, 32, 30, 256, 100, [1, 8, 13, 72]);
  save('panel-frame.png', p);
}

function makeRow(name, selected = false) {
  const p = png(640, 96);
  rect(p, 12, 14, 616, 68, colors.shadow);
  bevelBox(p, 16, 8, 608, 72, {
    accent: selected ? colors.cyan : colors.gold,
    glow: selected ? colors.cyan : null,
    fillTop: selected ? [12, 54, 74, 255] : colors.navy2,
    fillBottom: selected ? [6, 28, 42, 255] : colors.navy1,
  });
  rect(p, 36, 28, 54, 34, selected ? [14, 86, 116, 210] : [8, 24, 34, 210]);
  rect(p, 110, 30, 300, 5, [255, 255, 255, selected ? 35 : 22]);
  rect(p, 110, 52, 220, 4, selected ? [88, 204, 255, 90] : [205, 165, 74, 55]);
  save(name, p);
}

function makeButton(name, kind) {
  const p = png(220, 72);
  const map = {
    primary: { accent: colors.cyan, glow: colors.cyan, top: [14, 77, 105, 255], bottom: [7, 32, 48, 255] },
    neutral: { accent: colors.gold, glow: null, top: colors.navy2, bottom: colors.navy1 },
    danger: { accent: colors.red, glow: colors.red, top: [82, 28, 31, 255], bottom: [40, 14, 18, 255] },
  }[kind];
  rect(p, 8, 11, 204, 48, colors.shadow);
  bevelBox(p, 10, 6, 200, 54, { accent: map.accent, glow: map.glow, fillTop: map.top, fillBottom: map.bottom });
  save(name, p);
}

function makeCard(name, selected = false) {
  const p = png(220, 168);
  rect(p, 12, 14, 196, 140, colors.shadow);
  bevelBox(p, 14, 8, 192, 146, {
    accent: selected ? colors.cyan : colors.gold,
    glow: selected ? colors.cyan : null,
    fillTop: selected ? [13, 55, 74, 255] : colors.navy2,
    fillBottom: colors.navy1,
  });
  rect(p, 54, 28, 112, 76, [2, 10, 16, 96]);
  hline(p, 72, 120, 76, selected ? colors.cyan : colors.gold);
  save(name, p);
}

function makeToggle(name, on = false) {
  const p = png(128, 56);
  rect(p, 6, 8, 116, 40, colors.shadow);
  bevelBox(p, 8, 6, 112, 42, {
    accent: on ? colors.cyan : colors.gold,
    glow: on ? colors.cyan : null,
    fillTop: on ? [13, 72, 94, 255] : colors.navy2,
    fillBottom: colors.navy1,
  });
  rect(p, on ? 72 : 18, 14, 32, 26, on ? colors.cyanDim : [44, 54, 60, 255]);
  hline(p, on ? 76 : 22, 18, 24, on ? colors.cyan : colors.steelHi);
  save(name, p);
}

function icon(name, draw) {
  const p = png(64, 64);
  bevelBox(p, 6, 6, 52, 52, { accent: colors.gold, fillTop: [10, 31, 43, 255], fillBottom: colors.navy1 });
  draw(p);
  save(`icon-${name}.png`, p);
}

function pix(p, pts, c = colors.ink) {
  for (const [x, y, w = 4, h = 4] of pts) rect(p, x, y, w, h, c);
}

makeHeader();
makePanel();
makeRow('lobby-row.png');
makeRow('lobby-row-current.png', true);
makeButton('button-primary.png', 'primary');
makeButton('button-neutral.png', 'neutral');
makeButton('button-danger.png', 'danger');
makeCard('squad-card.png');
makeCard('squad-card-selected.png', true);
makeToggle('toggle-off.png', false);
makeToggle('toggle-on.png', true);
icon('players', (p) => pix(p, [[18, 22, 10, 10], [36, 22, 10, 10], [14, 34, 18, 10], [32, 34, 18, 10]], colors.cyan));
icon('start', (p) => pix(p, [[30, 16, 5, 24], [20, 26, 24, 5], [22, 17, 6, 6], [37, 17, 6, 6], [18, 41, 28, 5]], colors.goldHi));
icon('leave', (p) => pix(p, [[18, 16, 22, 4], [18, 16, 4, 30], [18, 42, 22, 4], [34, 25, 12, 4], [42, 21, 4, 12], [46, 27, 4, 4]], colors.red));
icon('refresh', (p) => pix(p, [[20, 18, 24, 4], [16, 22, 4, 12], [40, 22, 4, 6], [34, 14, 4, 12], [38, 18, 8, 4], [20, 42, 24, 4], [44, 30, 4, 12], [20, 36, 4, 6], [26, 38, 4, 12], [18, 42, 8, 4]], colors.cyan));
icon('gear', (p) => pix(p, [[29, 16, 6, 32], [16, 29, 32, 6], [21, 21, 6, 6], [37, 21, 6, 6], [21, 37, 6, 6], [37, 37, 6, 6], [26, 26, 12, 12]], colors.steelHi));
icon('speaker', (p) => pix(p, [[18, 28, 8, 10], [26, 24, 8, 18], [38, 25, 4, 4], [42, 29, 4, 8], [38, 39, 4, 4]], colors.cyan));
icon('pawn', (p) => pix(p, [[28, 18, 8, 8], [26, 28, 12, 8], [24, 38, 16, 6], [20, 46, 24, 4]], colors.ink));
icon('knight', (p) => pix(p, [[24, 18, 16, 6], [22, 24, 22, 6], [28, 30, 12, 12], [24, 42, 20, 5], [20, 48, 28, 4], [20, 24, 4, 10]], colors.ink));
icon('bishop', (p) => pix(p, [[30, 16, 6, 8], [26, 24, 14, 16], [30, 28, 4, 10], [24, 42, 20, 5], [20, 48, 28, 4]], colors.ink));
icon('rook', (p) => pix(p, [[20, 18, 6, 8], [30, 18, 6, 8], [40, 18, 6, 8], [22, 26, 22, 16], [20, 42, 26, 6], [18, 48, 30, 4]], colors.ink));
