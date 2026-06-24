import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/assets/ui/settings');
const SOURCE_DIR = path.join(OUT_DIR, 'generated-source');

const TAB_SOURCE = path.join(SOURCE_DIR, 'rail-tabs-generated-sheet-v1.png');
const ICON_SOURCE = path.join(SOURCE_DIR, 'rail-icons-generated-sheet-v1.png');

const TAB_NAMES = [
  'rail-tab-inactive-generated.png',
  'rail-tab-active-generated.png',
  'rail-tab-hover-generated.png',
  'rail-tab-disabled-generated.png',
];

const ICON_NAMES = [
  'icon-gear-generated.png',
  'icon-speaker-generated.png',
  'icon-knight-generated.png',
  'icon-wrench-generated.png',
];

function readPNG(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { w: png.width, h: png.height, data: Buffer.from(png.data) };
}

function writePNG(img, file) {
  const png = new PNG({ width: img.w, height: img.h });
  img.data.copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
}

function pixelIndex(img, x, y) {
  return (y * img.w + x) * 4;
}

function makeImage(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4) };
}

function isKey(img, x, y) {
  const i = pixelIndex(img, x, y);
  const r = img.data[i];
  const g = img.data[i + 1];
  const b = img.data[i + 2];
  return r > 180 && b > 145 && g < 140 && r > g * 1.5 && b > g * 1.35;
}

function cropWithAlpha(img, rect) {
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
      out.data[di + 3] = isKey(img, sx, sy) ? 0 : img.data[si + 3];
    }
  }
  return out;
}

function paste(src, dest, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dest.w || ty >= dest.h) continue;
      const si = pixelIndex(src, x, y);
      const di = pixelIndex(dest, tx, ty);
      dest.data[di] = src.data[si];
      dest.data[di + 1] = src.data[si + 1];
      dest.data[di + 2] = src.data[si + 2];
      dest.data[di + 3] = src.data[si + 3];
    }
  }
}

function nonKeyRowRuns(img) {
  const runs = [];
  let inRun = false;
  let start = 0;
  for (let y = 0; y < img.h; y++) {
    let count = 0;
    for (let x = 0; x < img.w; x++) {
      if (!isKey(img, x, y)) count++;
    }
    if (count > 20 && !inRun) {
      start = y;
      inRun = true;
    }
    if ((count <= 20 || y === img.h - 1) && inRun) {
      runs.push([start, y - 1]);
      inRun = false;
    }
  }
  return runs;
}

function nonKeyColumnRuns(img) {
  const runs = [];
  let inRun = false;
  let start = 0;
  for (let x = 0; x < img.w; x++) {
    let count = 0;
    for (let y = 0; y < img.h; y++) {
      if (!isKey(img, x, y)) count++;
    }
    if (count > 20 && !inRun) {
      start = x;
      inRun = true;
    }
    if ((count <= 20 || x === img.w - 1) && inRun) {
      runs.push([start, x - 1]);
      inRun = false;
    }
  }
  return runs;
}

function bboxForRowRun(img, y0, y1, pad = 0) {
  let x0 = img.w;
  let x1 = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < img.w; x++) {
      if (isKey(img, x, y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
    }
  }
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    w: Math.min(img.w - Math.max(0, x0 - pad), x1 - x0 + 1 + pad * 2),
    h: Math.min(img.h - Math.max(0, y0 - pad), y1 - y0 + 1 + pad * 2),
  };
}

function bboxForColumnRun(img, x0, x1, pad = 12) {
  let y0 = img.h;
  let y1 = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = 0; y < img.h; y++) {
      if (isKey(img, x, y)) continue;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    w: Math.min(img.w - Math.max(0, x0 - pad), x1 - x0 + 1 + pad * 2),
    h: Math.min(img.h - Math.max(0, y0 - pad), y1 - y0 + 1 + pad * 2),
  };
}

function bboxForRegion(img, region, pad = 16) {
  let x0 = img.w;
  let x1 = 0;
  let y0 = img.h;
  let y1 = 0;
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < region.x + region.w; x++) {
      if (isKey(img, x, y)) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    w: Math.min(img.w - Math.max(0, x0 - pad), x1 - x0 + 1 + pad * 2),
    h: Math.min(img.h - Math.max(0, y0 - pad), y1 - y0 + 1 + pad * 2),
  };
}

function centerOnCanvas(img, size = 112) {
  const out = makeImage(size, size);
  paste(img, out, Math.round((size - img.w) / 2), Math.round((size - img.h) / 2));
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tabs = readPNG(TAB_SOURCE);
  const tabRuns = nonKeyRowRuns(tabs);
  if (tabRuns.length < TAB_NAMES.length) {
    throw new Error(`Expected ${TAB_NAMES.length} tab rows, found ${tabRuns.length}`);
  }
  tabRuns.slice(0, TAB_NAMES.length).forEach(([y0, y1], index) => {
    const rect = bboxForRowRun(tabs, y0, y1, 0);
    writePNG(cropWithAlpha(tabs, rect), path.join(OUT_DIR, TAB_NAMES[index]));
  });

  const icons = readPNG(ICON_SOURCE);
  const iconCellW = Math.floor(icons.w / ICON_NAMES.length);
  ICON_NAMES.forEach((name, index) => {
    const region = {
      x: index * iconCellW,
      y: 0,
      w: index === ICON_NAMES.length - 1 ? icons.w - index * iconCellW : iconCellW,
      h: icons.h,
    };
    const rect = bboxForRegion(icons, region, 18);
    writePNG(centerOnCanvas(cropWithAlpha(icons, rect), 384), path.join(OUT_DIR, ICON_NAMES[index]));
  });
}

main();
