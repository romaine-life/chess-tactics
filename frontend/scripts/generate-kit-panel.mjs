import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { verifyAsset } from './verify-kit-asset.mjs';

const SOURCE = new URL('../../docs/art/ui-screen-concepts/generated/settings-general-concept-v1.png', import.meta.url);
const OUT = new URL('../public/assets/ui/kit/', import.meta.url);

const contentPanel = { x: 354, y: 150, w: 1224, h: 812 };
const size = 128;
const slice = 36;

mkdirSync(OUT, { recursive: true });

const source = PNG.sync.read(readFileSync(SOURCE));
const outDir = fileURLToPath(OUT);

function makePng(width, height) {
  const png = new PNG({ width, height });
  png.data.fill(0);
  return png;
}

function copyPixel(src, sx, sy, dst, dx, dy) {
  if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) return;
  const si = (src.width * sy + sx) * 4;
  const di = (dst.width * dy + dx) * 4;
  dst.data[di] = src.data[si];
  dst.data[di + 1] = src.data[si + 1];
  dst.data[di + 2] = src.data[si + 2];
  dst.data[di + 3] = src.data[si + 3];
}

function crop({ x, y, w, h }) {
  const png = makePng(w, h);

  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      copyPixel(source, x + xx, y + yy, png, xx, yy);
    }
  }

  return png;
}

function paste(src, dst, x, y) {
  for (let yy = 0; yy < src.height; yy += 1) {
    for (let xx = 0; xx < src.width; xx += 1) {
      copyPixel(src, xx, yy, dst, x + xx, y + yy);
    }
  }
}

function tile(src, dst, x, y, w, h) {
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      copyPixel(src, xx % src.width, yy % src.height, dst, x + xx, y + yy);
    }
  }
}

function scaleNearest(src, factor) {
  const dst = makePng(src.width * factor, src.height * factor);

  for (let y = 0; y < dst.height; y += 1) {
    for (let x = 0; x < dst.width; x += 1) {
      copyPixel(src, Math.floor(x / factor), Math.floor(y / factor), dst, x, y);
    }
  }

  return dst;
}

function writePng(name, png) {
  const path = join(outDir, name);
  const bytes = PNG.sync.write(png);

  try {
    writeFileSync(path, bytes);
  } catch (error) {
    if (error.code !== 'EPERM' || process.platform !== 'win32') throw error;

    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '$base64 = [Console]::In.ReadToEnd(); [IO.File]::WriteAllBytes($env:KIT_PANEL_OUT, [Convert]::FromBase64String($base64))',
      ],
      { input: bytes.toString('base64'), env: { ...process.env, KIT_PANEL_OUT: path } },
    );
  }
}

function clearFlatOutsideCorner(png, corner) {
  const starts = {
    topLeft: [[0, 0]],
    topRight: [[png.width - 1, 0]],
    bottomLeft: [[0, png.height - 1]],
    bottomRight: [[png.width - 1, png.height - 1]],
  }[corner];

  const queue = starts.map(([x, y]) => [x, y]);
  const seen = new Uint8Array(png.width * png.height);

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;

    const pi = png.width * y + x;
    if (seen[pi]) continue;
    seen[pi] = 1;

    const i = pi * 4;
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];

    if (r + g + b > 18) continue;

    png.data[i + 3] = 0;
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function buildPanel() {
  const right = contentPanel.x + contentPanel.w - slice;
  const bottom = contentPanel.y + contentPanel.h - slice;
  const panel = makePng(size, size);

  const corners = {
    topLeft: crop({ x: contentPanel.x, y: contentPanel.y, w: slice, h: slice }),
    topRight: crop({ x: right, y: contentPanel.y, w: slice, h: slice }),
    bottomLeft: crop({ x: contentPanel.x, y: bottom, w: slice, h: slice }),
    bottomRight: crop({ x: right, y: bottom, w: slice, h: slice }),
  };

  for (const [name, png] of Object.entries(corners)) clearFlatOutsideCorner(png, name);

  const top = crop({ x: contentPanel.x + 540, y: contentPanel.y, w: 24, h: slice });
  const bottomEdge = crop({ x: contentPanel.x + 540, y: bottom, w: 24, h: slice });
  const left = crop({ x: contentPanel.x, y: contentPanel.y + 350, w: slice, h: 24 });
  const rightEdge = crop({ x: right, y: contentPanel.y + 350, w: slice, h: 24 });
  const center = crop({ x: contentPanel.x + 520, y: contentPanel.y + 740, w: 48, h: 48 });

  tile(center, panel, slice, slice, size - slice * 2, size - slice * 2);
  tile(top, panel, slice, 0, size - slice * 2, slice);
  tile(bottomEdge, panel, slice, size - slice, size - slice * 2, slice);
  tile(left, panel, 0, slice, slice, size - slice * 2);
  tile(rightEdge, panel, size - slice, slice, slice, size - slice * 2);

  paste(corners.topLeft, panel, 0, 0);
  paste(corners.topRight, panel, size - slice, 0);
  paste(corners.bottomLeft, panel, 0, size - slice);
  paste(corners.bottomRight, panel, size - slice, size - slice);

  return panel;
}

const panel = buildPanel();
verifyAsset(panel, { label: 'panel' }); // GATE: throws on clip/missing-border
const panel2x = scaleNearest(panel, 2);

if (process.argv.includes('--stdout-json')) {
  process.stdout.write(
    JSON.stringify({
      'panel.png': PNG.sync.write(panel).toString('base64'),
      'panel@2x.png': PNG.sync.write(panel2x).toString('base64'),
    }),
  );
} else {
  writePng('panel.png', panel);
  writePng('panel@2x.png', panel2x);
}
