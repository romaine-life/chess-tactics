import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.resolve(ROOT, '../docs/art/ui-screen-concepts/generated');
const OUT_DIR = path.join(ROOT, 'public/assets/ui/settings');

const SOURCES = {
  general: path.join(SOURCE_DIR, 'settings-general-concept-v1.png'),
  audio: path.join(SOURCE_DIR, 'settings-audio-concept-v1.png'),
  gameplay: path.join(SOURCE_DIR, 'settings-gameplay-concept-v1.png'),
  creatorTools: path.join(SOURCE_DIR, 'settings-creator-tools-concept-v1.png'),
  page: path.join(SOURCE_DIR, 'settings-page-concept-v1.png'),
};

const BRIDGE_IMAGES = [
  { name: 'general', source: 'general', file: 'general.png' },
  { name: 'audio', source: 'audio', file: 'audio.png' },
  { name: 'gameplay', source: 'gameplay', file: 'gameplay.png' },
  { name: 'creator-tools', source: 'creatorTools', file: 'creator-tools.png' },
];

const TRANSPARENT_EDGE_KEYS = [
  [2, 10, 16],
  [3, 13, 20],
  [4, 16, 24],
  [6, 19, 29],
  [9, 22, 32],
  [12, 26, 37],
];

const assets = [
  {
    name: 'page-frame',
    source: 'general',
    rect: { x: 0, y: 0, w: 1600, h: 1000 },
    blank: [
      { x: 44, y: 24, w: 360, h: 88, color: [2, 13, 20, 255] },
      { x: 888, y: 43, w: 320, h: 58, color: [2, 13, 20, 255] },
      { x: 1232, y: 44, w: 130, h: 54, color: [3, 20, 30, 255] },
      { x: 1390, y: 44, w: 150, h: 54, color: [3, 20, 30, 255] },
      { x: 30, y: 174, w: 286, h: 404, color: [2, 17, 27, 255] },
      { x: 394, y: 190, w: 1148, h: 724, color: [2, 17, 27, 255] },
    ],
    textStatus: 'textless-blanked',
    liveLimitations:
      'Full-screen shell retains source-scale bridge layout; use only when a component needs the complete settings chrome as one bitmap.',
    recommendedUsage: 'Optional page shell behind separately positioned live header, rail, and content components.',
    strategy:
      'Full settings shell from the General bridge with header labels, nav buttons, rail tab contents, and main-panel content blanked.',
  },
  {
    name: 'header-frame',
    source: 'general',
    rect: { x: 7, y: 7, w: 1572, h: 123 },
    blank: [
      { x: 36, y: 22, w: 83, h: 86, color: [2, 13, 20, 255] },
      { x: 135, y: 26, w: 270, h: 78, color: [2, 13, 20, 255] },
      { x: 870, y: 34, w: 315, h: 57, color: [2, 13, 20, 255] },
      { x: 1198, y: 18, w: 350, h: 88, color: [2, 13, 20, 255] },
      { x: 1229, y: 37, w: 132, h: 50, color: [3, 20, 30, 255] },
      { x: 1385, y: 37, w: 148, h: 50, color: [3, 20, 30, 255] },
    ],
    textStatus: 'textless-blanked',
    liveLimitations:
      'Header action wells and the right-control field are blank color patches sampled from the concept; arrows/menu/user glyphs should be separate live DOM or icon assets.',
    recommendedUsage: 'Top settings chrome background with live title, account state, and navigation controls overlaid.',
    strategy: 'Opaque crop of the full top chrome frame from the General concept with brand and button text areas blanked.',
  },
  {
    name: 'rail-panel-frame',
    source: 'general',
    rect: { x: 7, y: 150, w: 326, h: 812 },
    blank: [{ x: 16, y: 18, w: 294, h: 420, color: [2, 17, 27, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Tab stack area is flattened to a sampled dark fill; use tab assets for individual navigation rows.',
    recommendedUsage: 'Left rail background frame behind live tab buttons.',
    strategy: 'Opaque crop of the left settings rail frame with the baked tab stack cleared.',
  },
  {
    name: 'main-panel-frame',
    source: 'general',
    rect: { x: 354, y: 150, w: 1224, h: 812 },
    blank: [{ x: 32, y: 24, w: 1158, h: 744, color: [2, 17, 27, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Interior is a solid sampled fill rather than reconstructed gradient texture.',
    recommendedUsage: 'Large content-area backing panel behind live sections and setting rows.',
    strategy: 'Opaque crop of the large content panel frame with all baked General content cleared.',
  },
  {
    name: 'section-divider-frame',
    source: 'audio',
    rect: { x: 423, y: 176, w: 1116, h: 28 },
    blank: [{ x: 0, y: 0, w: 112, h: 28, color: [2, 17, 27, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'The left label pad is a flat blank; render section titles in DOM over the blank area.',
    recommendedUsage: 'Section heading rule with live heading text placed on the left.',
    strategy: 'Horizontal amber section rule from Audio with the MASTER label cleared.',
  },
  {
    name: 'active-tab',
    source: 'audio',
    rect: { x: 25, y: 274, w: 307, h: 85 },
    transparent: true,
    blank: [
      { x: 23, y: 15, w: 252, h: 56, color: [0, 0, 0, 0] },
    ],
    textStatus: 'textless-blanked',
    liveLimitations: 'Icon and label wells are flat blanks; overlay live tab icon and label.',
    recommendedUsage: 'Selected rail tab background.',
    strategy: 'Active rail tab crop with the live label blanked, preserving the glowing frame and icon well.',
  },
  {
    name: 'inactive-tab',
    source: 'audio',
    rect: { x: 26, y: 174, w: 303, h: 79 },
    transparent: true,
    blank: [
      { x: 22, y: 12, w: 250, h: 56, color: [0, 0, 0, 0] },
    ],
    textStatus: 'textless-blanked',
    liveLimitations: 'Icon and label wells are flat blanks; overlay live tab icon and label.',
    recommendedUsage: 'Unselected rail tab background.',
    strategy: 'Inactive rail tab crop with the live label blanked, preserving amber corner hardware.',
  },
  {
    name: 'setting-row-frame',
    source: 'audio',
    rect: { x: 408, y: 213, w: 1116, h: 82 },
    blank: [{ x: 30, y: 12, w: 1066, h: 56, color: [2, 17, 27, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Interior content and icon plate are flattened; overlay row icon, text, and controls separately.',
    recommendedUsage: 'Standard one-line setting row frame.',
    strategy: 'Single-row setting frame from Audio, with contents cleared for runtime text and controls.',
  },
  {
    name: 'setting-row-tall-frame',
    source: 'general',
    rect: { x: 393, y: 222, w: 1138, h: 126 },
    blank: [{ x: 20, y: 12, w: 1100, h: 98, color: [2, 17, 27, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Interior content, account emblem, and right-side button are flattened; overlay live content separately.',
    recommendedUsage: 'Taller setting/account row frame for rows with descriptions or larger actions.',
    strategy: 'Taller setting/account row from General, with center content cleared.',
  },
  {
    name: 'neutral-button',
    source: 'audio',
    rect: { x: 1276, y: 468, w: 224, h: 57 },
    blank: [{ x: 10, y: 7, w: 204, h: 42, color: [3, 22, 33, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Fixed-width button crop; scale carefully or nine-slice in component code.',
    recommendedUsage: 'Secondary or neutral action button background with live label/icon overlay.',
    strategy: 'Neutral dark button frame from the View Tracks button; icon and label contents blanked.',
  },
  {
    name: 'primary-button',
    source: 'creatorTools',
    rect: { x: 1287, y: 279, w: 191, h: 62 },
    blank: [{ x: 48, y: 15, w: 101, h: 32, color: [2, 51, 95, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Arrow chevron is retained from source; omit live chevron or cover it if not desired.',
    recommendedUsage: 'Primary blue action button background with live label overlay.',
    strategy: 'Blue primary action button crop from Creator Tools; label text blanked.',
  },
  {
    name: 'danger-button',
    source: 'general',
    rect: { x: 1221, y: 622, w: 288, h: 58 },
    transparent: true,
    blank: [{ x: 36, y: 13, w: 214, h: 31, color: [27, 19, 22, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'Fixed-width destructive action crop; label area is a flat sampled blank.',
    recommendedUsage: 'Danger/destructive action button background with live label overlay.',
    strategy: 'Red danger button crop from Reset to Defaults; label text blanked.',
  },
  {
    name: 'toggle-on',
    source: 'audio',
    rect: { x: 1338, y: 231, w: 150, h: 45 },
    transparent: true,
    blank: [{ x: 27, y: 10, w: 48, h: 23, color: [3, 22, 33, 255] }],
    textStatus: 'textless-blanked',
    liveLimitations: 'ON text is blanked; render accessible state text outside or on top if needed.',
    recommendedUsage: 'On-state toggle bitmap backing.',
    strategy: 'On toggle crop from Audio; ON text blanked while preserving the right blue knob.',
  },
  {
    name: 'icon-gear',
    source: 'general',
    rect: { x: 40, y: 184, w: 76, h: 76 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Cropped rail icon with source antialiasing and transparent edge flood.',
    recommendedUsage: 'General tab icon.',
    strategy: 'Rail icon crop.',
  },
  {
    name: 'icon-speaker',
    source: 'audio',
    rect: { x: 42, y: 289, w: 76, h: 76 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Cropped rail icon with source antialiasing and transparent edge flood.',
    recommendedUsage: 'Audio tab icon.',
    strategy: 'Rail icon crop.',
  },
  {
    name: 'icon-knight',
    source: 'general',
    rect: { x: 42, y: 387, w: 76, h: 84 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Cropped rail icon with source antialiasing and transparent edge flood.',
    recommendedUsage: 'Gameplay tab icon.',
    strategy: 'Rail icon crop.',
  },
  {
    name: 'icon-wrench',
    source: 'general',
    rect: { x: 39, y: 490, w: 82, h: 82 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Cropped rail icon with source antialiasing and transparent edge flood.',
    recommendedUsage: 'Creator Tools tab icon.',
    strategy: 'Rail icon crop.',
  },
  {
    name: 'icon-monitor',
    source: 'general',
    rect: { x: 414, y: 440, w: 64, h: 60 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'UI scale or display/interface setting row icon.',
    strategy: 'Inline setting icon crop.',
  },
  {
    name: 'icon-reset',
    source: 'general',
    rect: { x: 414, y: 620, w: 64, h: 59 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'Reset/defaults setting row icon.',
    strategy: 'Inline setting icon crop.',
  },
  {
    name: 'icon-save',
    source: 'general',
    rect: { x: 414, y: 797, w: 63, h: 61 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'Local save/status setting row icon.',
    strategy: 'Inline setting icon crop.',
  },
  {
    name: 'icon-music',
    source: 'audio',
    rect: { x: 430, y: 390, w: 52, h: 56 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'Music setting row icon.',
    strategy: 'Inline music icon crop.',
  },
  {
    name: 'icon-effects',
    source: 'audio',
    rect: { x: 430, y: 630, w: 52, h: 52 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'Effects volume setting row icon.',
    strategy: 'Inline effects icon crop.',
  },
  {
    name: 'icon-interface-sounds',
    source: 'audio',
    rect: { x: 431, y: 715, w: 51, h: 53 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the small dark icon plate from the source row.',
    recommendedUsage: 'Interface sounds setting row icon.',
    strategy: 'Inline square/sound-toggle icon crop.',
  },
  {
    name: 'icon-design-index',
    source: 'creatorTools',
    rect: { x: 448, y: 254, w: 112, h: 111 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the larger blue creator-tool icon plate from the source row.',
    recommendedUsage: 'Design Index row icon.',
    strategy: 'Creator Tools row icon crop.',
  },
  {
    name: 'icon-tileset-studio',
    source: 'creatorTools',
    rect: { x: 448, y: 425, w: 112, h: 111 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the larger blue creator-tool icon plate from the source row.',
    recommendedUsage: 'Tileset Studio row icon.',
    strategy: 'Creator Tools row icon crop.',
  },
  {
    name: 'icon-unit-studio',
    source: 'creatorTools',
    rect: { x: 448, y: 595, w: 112, h: 111 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the larger blue creator-tool icon plate from the source row.',
    recommendedUsage: 'Unit Studio row icon.',
    strategy: 'Creator Tools row icon crop.',
  },
  {
    name: 'icon-tileset-review',
    source: 'creatorTools',
    rect: { x: 448, y: 766, w: 112, h: 111 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Includes the larger blue creator-tool icon plate from the source row.',
    recommendedUsage: 'Tileset Review row icon.',
    strategy: 'Creator Tools row icon crop.',
  },
  {
    name: 'icon-info',
    source: 'audio',
    rect: { x: 435, y: 864, w: 34, h: 37 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Small marker only; does not include the surrounding note row.',
    recommendedUsage: 'Info/note row marker.',
    strategy: 'Small info marker crop.',
  },
  {
    name: 'brand-rook-shield',
    source: 'general',
    rect: { x: 43, y: 29, w: 83, h: 86 },
    transparent: true,
    textStatus: 'textless',
    liveLimitations: 'Header emblem only; source crop keeps the shield silhouette.',
    recommendedUsage: 'Settings brand emblem.',
    strategy: 'Header rook shield crop.',
  },
];

function readPNG(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  return { w: png.width, h: png.height, data: Buffer.from(png.data) };
}

function makeImage(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4, 0) };
}

function pixelIndex(img, x, y) {
  return (y * img.w + x) * 4;
}

function crop(img, rect) {
  const out = makeImage(rect.w, rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x;
      const sy = rect.y + y;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const si = pixelIndex(img, sx, sy);
      const di = pixelIndex(out, x, y);
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function colorDist2(data, i, key) {
  const dr = data[i] - key[0];
  const dg = data[i + 1] - key[1];
  const db = data[i + 2] - key[2];
  return dr * dr + dg * dg + db * db;
}

function isEdgeBackground(img, x, y, tolerance = 27) {
  const i = pixelIndex(img, x, y);
  const t2 = tolerance * tolerance;
  return TRANSPARENT_EDGE_KEYS.some((key) => colorDist2(img.data, i, key) <= t2);
}

function floodTransparentEdges(img) {
  const seen = new Uint8Array(img.w * img.h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
    const p = y * img.w + x;
    if (seen[p] || !isEdgeBackground(img, x, y)) return;
    seen[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < img.w; x++) {
    push(x, 0);
    push(x, img.h - 1);
  }
  for (let y = 0; y < img.h; y++) {
    push(0, y);
    push(img.w - 1, y);
  }

  while (stack.length) {
    const p = stack.pop();
    const x = p % img.w;
    const y = (p - x) / img.w;
    img.data[p * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

function fillRect(img, rect) {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(img.w, rect.x + rect.w);
  const y1 = Math.min(img.h, rect.y + rect.h);
  const color = rect.color || [2, 17, 27, 255];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = pixelIndex(img, x, y);
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = color[3];
    }
  }
}

function writePNG(img, filePath) {
  const png = new PNG({ width: img.w, height: img.h });
  img.data.copy(png.data);
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function cloneImage(img) {
  return { w: img.w, h: img.h, data: Buffer.from(img.data) };
}

function paste(src, dest, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dest.w || ty >= dest.h) continue;
      const si = pixelIndex(src, x, y);
      const di = pixelIndex(dest, tx, ty);
      if (src.data[si + 3] === 0) continue;
      dest.data[di] = src.data[si];
      dest.data[di + 1] = src.data[si + 1];
      dest.data[di + 2] = src.data[si + 2];
      dest.data[di + 3] = src.data[si + 3];
    }
  }
}

function drawChecker(dest, x0, y0, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dark = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const i = pixelIndex(dest, x0 + x, y0 + y);
      const c = dark ? 14 : 26;
      dest.data[i] = c;
      dest.data[i + 1] = c + 4;
      dest.data[i + 2] = c + 10;
      dest.data[i + 3] = 255;
    }
  }
}

function pasteScaled(src, dest, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.w - 1, Math.floor((x / dw) * src.w));
      const sy = Math.min(src.h - 1, Math.floor((y / dh) * src.h));
      const si = pixelIndex(src, sx, sy);
      const di = pixelIndex(dest, dx + x, dy + y);
      const a = src.data[si + 3] / 255;
      dest.data[di] = Math.round(src.data[si] * a + dest.data[di] * (1 - a));
      dest.data[di + 1] = Math.round(src.data[si + 1] * a + dest.data[di + 1] * (1 - a));
      dest.data[di + 2] = Math.round(src.data[si + 2] * a + dest.data[di + 2] * (1 - a));
      dest.data[di + 3] = 255;
    }
  }
}

function makeContactSheet(items) {
  const cellW = 260;
  const cellH = 170;
  const pad = 20;
  const cols = 4;
  const rows = Math.ceil(items.length / cols);
  const sheet = makeImage(cols * cellW + pad, rows * cellH + pad);
  fillRect(sheet, { x: 0, y: 0, w: sheet.w, h: sheet.h, color: [4, 10, 16, 255] });

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = pad + col * cellW;
    const y = pad + row * cellH;
    const maxW = cellW - pad;
    const maxH = cellH - pad;
    const scale = Math.min(maxW / item.image.w, maxH / item.image.h, 1);
    const dw = Math.max(1, Math.round(item.image.w * scale));
    const dh = Math.max(1, Math.round(item.image.h * scale));
    const dx = x + Math.floor((maxW - dw) / 2);
    const dy = y + Math.floor((maxH - dh) / 2);
    drawChecker(sheet, dx, dy, dw, dh);
    pasteScaled(item.image, sheet, dx, dy, dw, dh);
  });

  return sheet;
}

function makeToggleOff(toggleOn) {
  const out = cloneImage(toggleOn);
  const knob = crop(toggleOn, { x: 89, y: 5, w: 53, h: 35 });
  fillRect(out, { x: 16, y: 6, w: 126, h: 33, color: [3, 22, 33, 255] });
  paste(knob, out, 16, 5);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    out.data[i] = Math.round(out.data[i] * 0.68);
    out.data[i + 1] = Math.round(out.data[i + 1] * 0.72);
    out.data[i + 2] = Math.round(out.data[i + 2] * 0.78);
  }
  return out;
}

function softenActiveTab(img) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    const isCyanGlow = b > 80 && g > 60 && b > r * 1.6;
    const isBlueFill = b > 45 && g > 30 && b > r * 1.5;
    if (isCyanGlow) {
      img.data[i] = Math.round(r * 0.52);
      img.data[i + 1] = Math.round(g * 0.58);
      img.data[i + 2] = Math.round(b * 0.66);
      img.data[i + 3] = Math.round(img.data[i + 3] * 0.78);
    } else if (isBlueFill) {
      img.data[i] = Math.round(r * 0.54);
      img.data[i + 1] = Math.round(g * 0.6);
      img.data[i + 2] = Math.round(b * 0.68);
    }
  }
}

function removeIconWellBackground(img) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    const max = Math.max(r, g, b);
    const blueDark = b > r + 8 && g > r + 4 && max < 90;
    const nearlyBlackBlue = max < 34 && b >= g && g >= r;
    if (blueDark || nearlyBlackBlue) {
      img.data[i + 3] = 0;
    }
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sourceImages = Object.fromEntries(
    Object.entries(SOURCES).map(([key, file]) => [key, readPNG(file)]),
  );
  const manifest = {
    generatedBy: 'frontend/scripts/extract-settings-ui-assets.mjs',
    generatedAt: new Date().toISOString(),
    sourceDirectory: 'docs/art/ui-screen-concepts/generated',
    notes: [
      'Reusable text-bearing controls were blanked manually in this script to keep live text out of runtime assets.',
      'Large panel crops are intentionally opaque because the concepts render those parts as background art layers.',
      'toggle-off.png is derived from toggle-on.png because the provided concepts do not contain a clean off-state toggle.',
      'The four full-page bridge images remain visual reference/fallback extraction screens and are not component-ready assets.',
    ],
    assets: {},
  };

  for (const bridge of BRIDGE_IMAGES) {
    const img = sourceImages[bridge.source];
    writePNG(cloneImage(img), path.join(OUT_DIR, bridge.file));
    manifest.assets[bridge.name] = {
      file: bridge.file,
      category: 'bridge-reference',
      componentReady: false,
      source: path.basename(SOURCES[bridge.source]),
      crop: { x: 0, y: 0, w: img.w, h: img.h },
      dimensions: { width: img.w, height: img.h },
      transparentEdges: false,
      textStatus: 'baked-text',
      liveLimitations:
        'Full-page bridge screen with baked labels and values. Use only as visual reference/fallback extraction material, not as a reusable component asset.',
      recommendedUsage: 'Reference/fallback bitmap for future settings extraction passes.',
      strategy: 'Copied from generated concept art to preserve the existing full-page bridge image.',
    };
  }

  let toggleOnImage = null;
  const contactItems = [];
  for (const spec of assets) {
    const img = crop(sourceImages[spec.source], spec.rect);
    for (const rect of spec.blank || []) fillRect(img, rect);
    if (spec.transparent) floodTransparentEdges(img);
    if (spec.name === 'active-tab') softenActiveTab(img);
    if (spec.name.startsWith('icon-') || spec.name === 'brand-rook-shield') removeIconWellBackground(img);

    const fileName = `${spec.name}.png`;
    writePNG(img, path.join(OUT_DIR, fileName));
    contactItems.push({ name: spec.name, image: img });
    manifest.assets[spec.name] = {
      file: fileName,
      category: 'component',
      componentReady: true,
      source: path.basename(SOURCES[spec.source]),
      crop: spec.rect,
      dimensions: { width: img.w, height: img.h },
      transparentEdges: Boolean(spec.transparent),
      blankedRegions: spec.blank || [],
      textStatus: spec.textStatus || 'textless',
      liveLimitations: spec.liveLimitations,
      recommendedUsage: spec.recommendedUsage,
      strategy: spec.strategy,
    };

    if (spec.name === 'toggle-on') toggleOnImage = img;
  }

  if (toggleOnImage) {
    const toggleOff = makeToggleOff(toggleOnImage);
    writePNG(toggleOff, path.join(OUT_DIR, 'toggle-off.png'));
    manifest.assets['toggle-off'] = {
      file: 'toggle-off.png',
      category: 'component',
      componentReady: true,
      source: 'settings-audio-concept-v1.png',
      crop: manifest.assets['toggle-on'].crop,
      dimensions: { width: toggleOff.w, height: toggleOff.h },
      transparentEdges: true,
      blankedRegions: [],
      textStatus: 'textless-derived',
      liveLimitations:
        'Derived state, not a source crop; visual fidelity is good enough for component prototyping but should be replaced if a true off-state concept becomes available.',
      recommendedUsage: 'Off-state toggle bitmap backing.',
      strategy: 'Derived from toggle-on by blanking the label, shifting the knob left, and dimming the blue lighting.',
    };
    contactItems.push({ name: 'toggle-off', image: toggleOff });
  }

  const contactSheet = makeContactSheet(contactItems);
  writePNG(contactSheet, path.join(OUT_DIR, 'contact-sheet.png'));
  manifest.assets['contact-sheet'] = {
    file: 'contact-sheet.png',
    category: 'documentation',
    componentReady: false,
    source: 'generated from component assets',
    crop: null,
    dimensions: { width: contactSheet.w, height: contactSheet.h },
    transparentEdges: false,
    textStatus: 'not-applicable',
    liveLimitations: 'Visual QA sheet only. Do not use in runtime UI.',
    recommendedUsage: 'Quick review of extracted component assets.',
    strategy: 'Generated by arranging the component-ready assets onto a checker-backed contact sheet.',
  };

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'README.md'),
    `# Settings UI Asset Kit

Generated by \`frontend/scripts/extract-settings-ui-assets.mjs\` from concept art in \`docs/art/ui-screen-concepts/generated\`.

The kit favors practical runtime pieces over perfect source separation. Text-bearing controls were cropped from the concepts and then had their label or content areas blanked so the application can render live DOM text and controls over bitmap art. Large panel and header frames are opaque background-art layers because their source artwork includes dark internal gradients.

The live \`/settings\` route is componentized. Header, rail, main panel, tabs,
rows, buttons, toggles, and icons are assembled from the smaller bitmap crops
in this kit, while labels, account state, and settings values remain live DOM.
The full-page bridge screens remain only as visual references and fallback
material for future extraction passes.

## Component-ready assets

Use these for the componentized settings UI:

- Page and panel frames: \`page-frame.png\`, \`header-frame.png\`, \`rail-panel-frame.png\`, \`main-panel-frame.png\`, \`section-divider-frame.png\`.
- Navigation tabs: \`active-tab.png\`, \`inactive-tab.png\`.
- Rows: \`setting-row-frame.png\`, \`setting-row-tall-frame.png\`.
- Buttons and toggles: \`neutral-button.png\`, \`primary-button.png\`, \`danger-button.png\`, \`toggle-on.png\`, \`toggle-off.png\`.
- Tab icons: \`icon-gear.png\`, \`icon-speaker.png\`, \`icon-knight.png\`, \`icon-wrench.png\`.
- Row icons: \`icon-monitor.png\`, \`icon-reset.png\`, \`icon-save.png\`, \`icon-music.png\`, \`icon-effects.png\`, \`icon-interface-sounds.png\`, \`icon-design-index.png\`, \`icon-tileset-studio.png\`, \`icon-unit-studio.png\`, \`icon-tileset-review.png\`, \`icon-info.png\`, \`brand-rook-shield.png\`.

The contact sheet \`contact-sheet.png\` is generated for quick visual QA and is not a runtime asset.

## Bridge/reference images

\`general.png\`, \`audio.png\`, \`gameplay.png\`, and \`creator-tools.png\` are full-page bridge/reference images. They intentionally keep baked text and full-screen composition for visual comparison and fallback extraction only. Do not treat them as reusable component assets or as the primary live route surface.

## Limitations

- The generated concepts are full-screen mockups, not layered source files, so blanked interiors use solid sampled colors rather than perfect reconstructed texture.
- \`toggle-off.png\` is derived from the on-toggle crop because no clean off-toggle exists in the current settings concepts.
- Icons are cropped from rendered UI and use edge flood transparency; some dark pixels from icon wells may remain where they are visually part of the icon plate.
- Some frame crops retain source-scale dimensions and are intended for nine-slice or background-layer use by future UI work.

See \`manifest.json\` for source image names, crop coordinates, dimensions, text/live limitations, and recommended usage for every generated file.
`,
  );

  const missing = Object.values(manifest.assets)
    .map((asset) => asset.file)
    .filter((file) => !fs.existsSync(path.join(OUT_DIR, file)));
  if (missing.length) {
    throw new Error(`Manifest references missing files: ${missing.join(', ')}`);
  }
}

main();
