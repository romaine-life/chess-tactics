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
