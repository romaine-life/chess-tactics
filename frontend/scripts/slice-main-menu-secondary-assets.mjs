import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'public/assets/ui/main-menu/secondary');

fs.mkdirSync(dir, { recursive: true });

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
