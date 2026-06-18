import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'public/assets/ui/main-menu/secondary');
const sourcePath = path.join(dir, 'source-contact-sheet.png');

const source = PNG.sync.read(fs.readFileSync(sourcePath));

const crops = [
  { name: 'daily-panel.png', rect: [18, 38, 496, 307] },
  { name: 'news-panel.png', rect: [542, 38, 407, 308] },
  { name: 'profile-panel.png', rect: [967, 39, 551, 122] },
  { name: 'status-panel.png', rect: [980, 213, 537, 120] },
  { name: 'battlefield-frame.png', rect: [31, 390, 759, 260] },
  { name: 'dock-chrome.png', rect: [212, 682, 1124, 116] },
  { name: 'dock-button-achievements-normal.png', rect: [456, 693, 119, 73], transparent: true },
  { name: 'dock-button-campaigns-normal.png', rect: [622, 693, 122, 73], transparent: true },
  { name: 'dock-button-stats-normal.png', rect: [790, 693, 122, 73], transparent: true },
  { name: 'dock-button-collection-normal.png', rect: [958, 693, 123, 73], transparent: true },
  { name: 'dock-button-achievements-hover.png', rect: [456, 778, 119, 74], transparent: true },
  { name: 'dock-button-campaigns-hover.png', rect: [622, 778, 122, 74], transparent: true },
  { name: 'dock-button-stats-hover.png', rect: [790, 778, 122, 74], transparent: true },
  { name: 'dock-button-collection-hover.png', rect: [958, 778, 123, 74], transparent: true },
  { name: 'dock-button-achievements-pressed.png', rect: [456, 870, 119, 76], transparent: true },
  { name: 'dock-button-campaigns-pressed.png', rect: [622, 870, 122, 76], transparent: true },
  { name: 'dock-button-stats-pressed.png', rect: [790, 870, 122, 76], transparent: true },
  { name: 'dock-button-collection-pressed.png', rect: [958, 870, 123, 76], transparent: true },
  { name: 'icon-hourglass.png', rect: [818, 393, 84, 88], transparent: true },
  { name: 'icon-reticle.png', rect: [947, 396, 88, 84], transparent: true },
  { name: 'icon-gem.png', rect: [1070, 393, 89, 88], transparent: true },
  { name: 'icon-shield.png', rect: [1195, 393, 90, 88], transparent: true },
  { name: 'icon-crown.png', rect: [1320, 392, 91, 88], transparent: true },
  { name: 'icon-book.png', rect: [1445, 393, 86, 87], transparent: true },
  { name: 'icon-trophy.png', rect: [842, 536, 89, 87], transparent: true },
  { name: 'icon-map.png', rect: [974, 535, 91, 90], transparent: true },
  { name: 'icon-stats.png', rect: [1144, 535, 87, 89], transparent: true },
  { name: 'icon-collection.png', rect: [1281, 533, 92, 90], transparent: true },
];

function crop({ name, rect, transparent = false }) {
  const [x, y, width, height] = rect;
  const out = new PNG({ width, height });
  PNG.bitblt(source, out, x, y, width, height, 0, 0);

  if (transparent) {
    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const idx = (width * py + px) << 2;
        const r = out.data[idx];
        const g = out.data[idx + 1];
        const b = out.data[idx + 2];
        const nearSheetBackground = r < 18 && g < 28 && b < 31;
        if (nearSheetBackground) {
          out.data[idx + 3] = 0;
        }
      }
    }
  }

  fs.writeFileSync(path.join(dir, name), PNG.sync.write(out));
}

for (const asset of crops) crop(asset);

function blank(width, height) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 0;
    out.data[i + 1] = 0;
    out.data[i + 2] = 0;
    out.data[i + 3] = 0;
  }
  return out;
}

function setPixel(out, x, y, color) {
  if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
  const idx = (out.width * y + x) << 2;
  out.data[idx] = color[0];
  out.data[idx + 1] = color[1];
  out.data[idx + 2] = color[2];
  out.data[idx + 3] = color[3];
}

function fill(out, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) setPixel(out, px, py, color);
  }
}

function stroke(out, x, y, width, height, color, size = 1) {
  fill(out, x, y, width, size, color);
  fill(out, x, y + height - size, width, size, color);
  fill(out, x, y, size, height, color);
  fill(out, x + width - size, y, size, height, color);
}

function bevel(out, x, y, width, height) {
  fill(out, x + 10, y, width - 20, 2, [142, 165, 175, 255]);
  fill(out, x + 10, y + height - 2, width - 20, 2, [18, 28, 36, 255]);
  fill(out, x, y + 10, 2, height - 20, [102, 127, 139, 255]);
  fill(out, x + width - 2, y + 10, 2, height - 20, [9, 16, 23, 255]);
  fill(out, x + 1, y + 1, 8, 2, [218, 174, 87, 255]);
  fill(out, x + width - 9, y + 1, 8, 2, [218, 174, 87, 255]);
  fill(out, x + 1, y + height - 3, 8, 2, [218, 174, 87, 255]);
  fill(out, x + width - 9, y + height - 3, 8, 2, [218, 174, 87, 255]);
  fill(out, Math.floor(x + width / 2) - 4, y + 1, 8, 3, [19, 199, 255, 255]);
  fill(out, Math.floor(x + width / 2) - 4, y + height - 4, 8, 3, [19, 199, 255, 255]);
}

function panel(name, width, height, options = {}) {
  const out = blank(width, height);
  fill(out, 0, 0, width, height, [1, 5, 8, 192]);
  fill(out, 5, 5, width - 10, height - 10, [5, 16, 23, 238]);
  fill(out, 10, 10, width - 20, height - 20, [8, 20, 28, 238]);
  stroke(out, 4, 4, width - 8, height - 8, [23, 34, 43, 255], 3);
  stroke(out, 8, 8, width - 16, height - 16, [58, 91, 108, 255], 1);
  stroke(out, 11, 11, width - 22, height - 22, [10, 13, 18, 255], 2);
  bevel(out, 4, 4, width - 8, height - 8);
  if (options.header) fill(out, 12, 38, width - 24, 2, [29, 66, 83, 255]);
  fs.writeFileSync(path.join(dir, name), PNG.sync.write(out));
}

function dockChrome() {
  const out = blank(1124, 146);
  fill(out, 0, 30, 1124, 78, [4, 11, 17, 220]);
  stroke(out, 54, 18, 1016, 106, [18, 30, 40, 255], 6);
  stroke(out, 76, 34, 972, 74, [57, 78, 90, 255], 2);
  fill(out, 0, 58, 80, 26, [21, 32, 42, 240]);
  fill(out, 1044, 58, 80, 26, [21, 32, 42, 240]);
  fill(out, 548, 12, 28, 12, [207, 154, 66, 255]);
  fill(out, 548, 122, 28, 12, [207, 154, 66, 255]);
  fill(out, 558, 2, 8, 142, [18, 199, 255, 180]);
  fs.writeFileSync(path.join(dir, 'dock-chrome.png'), PNG.sync.write(out));
}

panel('daily-panel.png', 496, 136, { header: true });
panel('news-panel.png', 407, 146, { header: true });
panel('profile-panel.png', 551, 94);
panel('status-panel.png', 537, 72);
dockChrome();
